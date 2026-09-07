// Agregaciones puras del módulo Marketing y Gestión de Leads.
// Todo se calcula en memoria a partir de las filas espejo (mk_leads / sh_prospectos).
import type { Inversion, Lead, Prospecto } from "./types";
import { SEGUIMIENTO } from "./types";

// ─── Clasificación de etapas ─────────────────────────────────────────────────
// Ciclo de Venta: Prospecto(10) > Contactado(10) > Seguimiento(25) > Oportunidad(50) > Negociación(100)
// Ciclo de Compra: Compra(100) > … ; Cancelado / Desistido = descartado.

export const esDescartado = (ciclo: string | null | undefined) =>
  /cancelad|desistid/i.test(ciclo ?? "");
export const esCompra = (ciclo: string | null | undefined, etapa: string | null | undefined, esVenta?: boolean) =>
  Boolean(esVenta) || /compra/i.test(ciclo ?? "") || /^compra/i.test(etapa ?? "");
export const esContactado = (etapa: string | null | undefined, acciones = 0) =>
  acciones > 0 || (!!etapa && !/^prospecto$/i.test(etapa.trim()));
export const esCalificado = (prob: number | null | undefined, ciclo?: string | null, etapa?: string | null, esVenta?: boolean) =>
  esCompra(ciclo, etapa, esVenta) || (!esDescartado(ciclo) && (prob ?? 0) >= 25);
export const esOportunidad = (prob: number | null | undefined, ciclo?: string | null, etapa?: string | null, esVenta?: boolean) =>
  esCompra(ciclo, etapa, esVenta) || (!esDescartado(ciclo) && (prob ?? 0) >= 50);

// ─── Embudo ──────────────────────────────────────────────────────────────────
export interface Embudo {
  contactos: number;      // registros digitales (todos)
  unicos: number;         // IsUniqueRecord
  contactados: number;    // salió de "Prospecto" (hubo gestión)
  calificados: number;    // probabilidad ≥ 25 (Seguimiento+)
  oportunidades: number;  // probabilidad ≥ 50
  ventas: number;
  descartados: number;
  vivos: number;          // en Ciclo de Venta sin descartar y sin vender
}

export function embudo(leads: Lead[]): Embudo {
  const e: Embudo = { contactos: 0, unicos: 0, contactados: 0, calificados: 0, oportunidades: 0, ventas: 0, descartados: 0, vivos: 0 };
  for (const l of leads) {
    e.contactos++;
    if (l.es_unico) e.unicos++;
    const venta = esCompra(l.ciclo, l.etapa, l.es_venta);
    const desc = esDescartado(l.ciclo);
    if (venta || esContactado(l.etapa)) e.contactados++;
    if (esCalificado(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) e.calificados++;
    if (esOportunidad(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) e.oportunidades++;
    if (venta) e.ventas++;
    else if (desc) e.descartados++;
    else e.vivos++;
  }
  return e;
}

// ─── Por creativo / anuncio ──────────────────────────────────────────────────
export interface PorCreativo {
  clave: string;
  titulo: string;
  tipo: string;
  url: string;
  miniatura: string;
  canales: string[];
  proyectos: string[];
  leads: number;
  unicos: number;
  contactados: number;
  calificados: number;
  oportunidades: number;
  ventas: number;
  descartados: number;
  creditoSi: number;
  creditoNo: number;
  reportadoSi: number;
  ultimoLead: string | null;
}

export function porCreativo(leads: Lead[]): PorCreativo[] {
  const map = new Map<string, PorCreativo>();
  for (const l of leads) {
    const clave = l.ad_id || (l.ad_titulo ? `t:${l.ad_titulo}` : l.formulario ? `f:${l.formulario}` : "organico");
    let c = map.get(clave);
    if (!c) {
      c = {
        clave,
        titulo: l.ad_titulo || (l.formulario ? `Formulario: ${l.formulario}` : l.ad_id ? `Anuncio ${l.ad_id}` : "Sin anuncio identificado (orgánico / directo)"),
        tipo: l.ad_tipo, url: l.ad_url, miniatura: l.ad_miniatura,
        canales: [], proyectos: [],
        leads: 0, unicos: 0, contactados: 0, calificados: 0, oportunidades: 0, ventas: 0, descartados: 0,
        creditoSi: 0, creditoNo: 0, reportadoSi: 0, ultimoLead: null,
      };
      map.set(clave, c);
    }
    if (!c.titulo && l.ad_titulo) c.titulo = l.ad_titulo;
    if (!c.url && l.ad_url) c.url = l.ad_url;
    if (!c.miniatura && l.ad_miniatura) c.miniatura = l.ad_miniatura;
    if (l.canal && !c.canales.includes(l.canal)) c.canales.push(l.canal);
    if (l.proyecto && !c.proyectos.includes(l.proyecto)) c.proyectos.push(l.proyecto);
    c.leads++;
    if (l.es_unico) c.unicos++;
    const venta = esCompra(l.ciclo, l.etapa, l.es_venta);
    if (venta || esContactado(l.etapa)) c.contactados++;
    if (esCalificado(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) c.calificados++;
    if (esOportunidad(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) c.oportunidades++;
    if (venta) c.ventas++;
    else if (esDescartado(l.ciclo)) c.descartados++;
    if (/^s/i.test(l.credito_aprobado)) c.creditoSi++;
    else if (/^n/i.test(l.credito_aprobado)) c.creditoNo++;
    if (/^s/i.test(l.reportado)) c.reportadoSi++;
    if (l.fecha_creacion && (!c.ultimoLead || l.fecha_creacion > c.ultimoLead)) c.ultimoLead = l.fecha_creacion;
  }
  return [...map.values()].sort((a, b) => b.ventas - a.ventas || b.calificados - a.calificados || b.leads - a.leads);
}

// ─── Por canal / por campo genérico ──────────────────────────────────────────
export interface Grupo {
  clave: string;
  leads: number;
  calificados: number;
  oportunidades: number;
  ventas: number;
  descartados: number;
}

export function agruparLeads(leads: Lead[], por: (l: Lead) => string): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const l of leads) {
    const k = por(l) || "—";
    let g = map.get(k);
    if (!g) { g = { clave: k, leads: 0, calificados: 0, oportunidades: 0, ventas: 0, descartados: 0 }; map.set(k, g); }
    g.leads++;
    const venta = esCompra(l.ciclo, l.etapa, l.es_venta);
    if (esCalificado(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) g.calificados++;
    if (esOportunidad(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) g.oportunidades++;
    if (venta) g.ventas++;
    else if (esDescartado(l.ciclo)) g.descartados++;
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

// ─── Perfil de quien compra (demografía) ─────────────────────────────────────
export interface Distribucion { valor: string; n: number; pct: number }

export function distribucion(items: (string | null | undefined)[], top = 8): { total: number; conDato: number; valores: Distribucion[] } {
  const m = new Map<string, number>();
  let conDato = 0;
  for (const raw of items) {
    const v = (raw ?? "").toString().trim();
    if (!v || v === "Ciudad:" || v === "0") continue;
    conDato++;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  const valores = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([valor, n]) => ({ valor, n, pct: conDato ? n / conDato : 0 }));
  return { total: items.length, conDato, valores };
}

export const rangoEdad = (e: number | null | undefined): string | null => {
  if (!e || e < 15 || e > 100) return null;
  if (e < 25) return "18–24";
  if (e < 35) return "25–34";
  if (e < 45) return "35–44";
  if (e < 55) return "45–54";
  return "55+";
};

export const normGenero = (g: string | null | undefined): string | null => {
  const v = (g ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith("F")) return "Femenino";
  if (v.startsWith("M")) return "Masculino";
  return v;
};

// ─── Gestión comercial por asesor ────────────────────────────────────────────
export interface GestionAsesor {
  asesor: string;
  recibidos: number;
  activos: number;       // seguimiento = 1 (verde)
  vencidos: number;      // seguimiento = 3 (rojo)
  inactivos: number;     // seguimiento = 0 (gris) dentro de Ciclo de Venta
  sinGestion: number;    // etapa Prospecto y 0 acciones (nunca tocado)
  sinGestion24h: number; // idem, creado hace > 24 h
  contactados: number;
  calificados: number;
  descartados: number;
  ventas: number;
  acciones: number;
}

export function gestionPorAsesor(prospectos: Prospecto[], ahora = Date.now()): GestionAsesor[] {
  const map = new Map<string, GestionAsesor>();
  for (const p of prospectos) {
    const k = p.asesor || "Sin asesor";
    let g = map.get(k);
    if (!g) {
      g = { asesor: k, recibidos: 0, activos: 0, vencidos: 0, inactivos: 0, sinGestion: 0, sinGestion24h: 0, contactados: 0, calificados: 0, descartados: 0, ventas: 0, acciones: 0 };
      map.set(k, g);
    }
    g.recibidos++;
    g.acciones += p.acciones ?? 0;
    const venta = esCompra(p.ciclo, p.etapa, p.es_venta);
    const desc = esDescartado(p.ciclo);
    if (venta) g.ventas++;
    else if (desc) g.descartados++;
    else {
      if (p.seguimiento === SEGUIMIENTO.ACTIVO) g.activos++;
      else if (p.seguimiento === SEGUIMIENTO.VENCIDO) g.vencidos++;
      else g.inactivos++;
    }
    const contactado = venta || esContactado(p.etapa, p.acciones);
    if (contactado) g.contactados++;
    else if (!desc) {
      g.sinGestion++;
      const t = p.fecha_creacion ? new Date(p.fecha_creacion).getTime() : 0;
      if (t && ahora - t > 24 * 3600 * 1000) g.sinGestion24h++;
    }
    if (esCalificado(p.probabilidad, p.ciclo, p.etapa, p.es_venta)) g.calificados++;
  }
  return [...map.values()].sort((a, b) => b.recibidos - a.recibidos);
}

export function totalGestion(rows: GestionAsesor[]): GestionAsesor {
  const t: GestionAsesor = { asesor: "Total", recibidos: 0, activos: 0, vencidos: 0, inactivos: 0, sinGestion: 0, sinGestion24h: 0, contactados: 0, calificados: 0, descartados: 0, ventas: 0, acciones: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof GestionAsesor)[]) if (k !== "asesor") (t[k] as number) += r[k] as number;
  return t;
}

// ─── Costo por lead / calificado / cliente (CPA) ─────────────────────────────
export interface CpaMes {
  mes: string;
  inversion: number;
  leads: number;
  calificados: number;
  ventas: number;
  cpl: number | null;
  cpc: number | null; // costo por calificado
  cpa: number | null; // costo por cliente
}

const canalDeInversion = (canal: string) => {
  const c = canal.toLowerCase();
  if (c.startsWith("face")) return "facebook";
  if (c.startsWith("insta")) return "instagram";
  if (c.startsWith("whats")) return "whatsapp";
  return c;
};

export function cpaPorMes(leads: Lead[], inversion: Inversion[], proyecto: string, canal: string): CpaMes[] {
  const meses = new Map<string, CpaMes>();
  const fila = (mes: string) => {
    let m = meses.get(mes);
    if (!m) { m = { mes, inversion: 0, leads: 0, calificados: 0, ventas: 0, cpl: null, cpc: null, cpa: null }; meses.set(mes, m); }
    return m;
  };
  for (const l of leads) {
    if (!l.fecha_creacion) continue;
    const m = fila(l.fecha_creacion.slice(0, 7));
    m.leads++;
    if (esCalificado(l.probabilidad, l.ciclo, l.etapa, l.es_venta)) m.calificados++;
    if (esCompra(l.ciclo, l.etapa, l.es_venta)) m.ventas++;
  }
  for (const i of inversion) {
    if (proyecto && i.proyecto && i.proyecto !== proyecto) continue;
    if (canal && i.canal && canalDeInversion(i.canal) !== canalDeInversion(canal)) continue;
    fila(i.mes).inversion += Number(i.monto) || 0;
  }
  for (const m of meses.values()) {
    m.cpl = m.inversion && m.leads ? m.inversion / m.leads : null;
    m.cpc = m.inversion && m.calificados ? m.inversion / m.calificados : null;
    m.cpa = m.inversion && m.ventas ? m.inversion / m.ventas : null;
  }
  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

// ─── Utilidades ──────────────────────────────────────────────────────────────
export const pct = (n: number, d: number) => (d ? n / d : 0);
export const canalCorto = (c: string) => c.replace("Facebook Leads Ad", "Facebook").replace("Página Web", "Web");

export const SEGUIMIENTO_LABEL = (v: number | null | undefined): { label: string; tone: "ok" | "high" | "mid" | "warn" } => {
  if (v === SEGUIMIENTO.ACTIVO) return { label: "Tarea activa", tone: "ok" };
  if (v === SEGUIMIENTO.VENCIDO) return { label: "Tarea vencida", tone: "high" };
  return { label: "Sin tareas", tone: "warn" };
};
