import "server-only";
// ════════════════════════════════════════════════════════════════════
// Servidor MCP de solo lectura — herramientas que Claude (u otro cliente
// MCP) puede llamar para consultar los datos de la plataforma.
// - describir_datos: diccionario de datos y reglas de cálculo.
// - consultar_sql: SELECT sobre el Supabase principal (misma función
//   asistente_consulta del Asistente IA: solo lectura, 300 filas, 25 s).
// - listar_contratos / consultar_registros / tarifario_contrato: registros
//   de los contratos de Proyecto Triple A, leídos de transporte_kv en su
//   propio Supabase (supabaseTransporte), igual que el módulo.
// Nada aquí escribe en la base.
// ════════════════════════════════════════════════════════════════════

import { supabaseAdmin, supabaseTransporte } from "@/lib/supabase/server";
import { ESQUEMA_AAA, ESQUEMA_CARTERA, ESQUEMA_MARKETING, ESQUEMA_PROSPECTOS, REGLAS_CALCULO } from "@/lib/asistente/contexto";
import { TODAS_LAS_TABLAS, validarAlcanceSql } from "@/lib/asistente/alcance";
import { CONTRACT_END_DEFAULT, CONTRACT_START_DEFAULT, CONTRACT_VALUE, FICHA_MODULO, KEY_CONTRATOS, tarifarioDefaultDe, type ContratoDinamico } from "@/lib/transporte/constants";
import { desgloseValor, findCategoria, findRuta, recargosCobrados } from "@/lib/transporte/logic";
import { areaAAADe, aprobadorDe, num, type Servicio, type Tarifario } from "@/lib/transporte/model";

export interface Herramienta {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const MAX_REGISTROS = 1000;

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: "describir_datos",
    description: "Devuelve el diccionario de datos de la plataforma de AG Constructora (tablas, columnas y su significado de negocio), las reglas de cálculo que usa la app y cómo consultar cada módulo. Llámala primero.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Diccionario de datos", ...SOLO_LECTURA },
  },
  {
    name: "consultar_sql",
    description: "Ejecuta una consulta SELECT (o WITH) de solo lectura en PostgreSQL sobre la base principal: cartera, cobranza, recaudo, prospectos, vendedores, marketing, prefacturas y facturas de Triple A. Máximo 300 filas y 25 s por consulta, sin punto y coma. Prefiere agregaciones (count, sum, group by). Los registros de los contratos de Proyecto Triple A NO se consultan aquí: usa consultar_registros.",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string", description: "Consulta PostgreSQL. Solo SELECT/WITH, sin punto y coma." } },
      required: ["sql"],
      additionalProperties: false,
    },
    annotations: { title: "Consultar SQL (solo lectura)", ...SOLO_LECTURA },
  },
  {
    name: "listar_contratos",
    description: "Lista los contratos de Proyecto Triple A (Transporte AAA, Contrato de Alquiler, Otro Sí / Emergencia y los creados en la app) con su identificador (ns), número, objeto, valor, vigencia y prefijo de órdenes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Contratos Triple A", ...SOLO_LECTURA },
  },
  {
    name: "consultar_registros",
    description: "Registros (servicios / órdenes) de un contrato de Proyecto Triple A en un rango de fechas, con ítem y ruta del pliego, recargos, horas, valor, interventor, área AAA, prefactura y estado de facturación. Devuelve totales y hasta 1000 registros.",
    inputSchema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "Identificador (ns) del contrato: 'transporte', 'alquiler', 'emergencia' o el id de un contrato creado en la app (ver listar_contratos)." },
        desde: { type: "string", description: "Fecha inicial AAAA-MM-DD (incluida). Opcional." },
        hasta: { type: "string", description: "Fecha final AAAA-MM-DD (incluida). Opcional." },
        interventor: { type: "string", description: "Filtra por interventor (contiene, sin distinguir mayúsculas). Opcional." },
        area_aaa: { type: "string", description: "Filtra por área AAA solicitante (contiene). Opcional." },
        prefacturado: { type: "string", enum: ["si", "no"], description: "Solo prefacturados ('si') o sin prefacturar ('no'). Opcional." },
        solo_totales: { type: "boolean", description: "true = devuelve solo los totales (por ítem/ruta/recargo y por interventor), sin el detalle." },
      },
      required: ["contrato"],
      additionalProperties: false,
    },
    annotations: { title: "Registros de un contrato", ...SOLO_LECTURA },
  },
  {
    name: "tarifario_contrato",
    description: "Tarifario (formulario de cantidades y precios) de un contrato de Proyecto Triple A: ítems, rutas del pliego / zonas con su valor unitario sin IVA y los recargos nocturno y dominical/festivo.",
    inputSchema: {
      type: "object",
      properties: { contrato: { type: "string", description: "Identificador (ns) del contrato (ver listar_contratos)." } },
      required: ["contrato"],
      additionalProperties: false,
    },
    annotations: { title: "Tarifario de un contrato", ...SOLO_LECTURA },
  },
];

export class ErrorHerramienta extends Error {}

// ── Contratos de Proyecto Triple A (transporte_kv) ─────────────────

const prefijo = (ns: string) => (ns === "transporte" ? "" : `${ns}:`);

async function kvGet(key: string): Promise<string | null> {
  const { data, error } = await supabaseTransporte().from("transporte_kv").select("value").eq("key", key).maybeSingle();
  if (error) throw new ErrorHerramienta(`No se pudo leer ${key}: ${error.message}`);
  return data ? (data.value as string) : null;
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function contratos() {
  const base = Object.entries(FICHA_MODULO).map(([ns, f]) => ({
    ns, nombre: f.nombre, numero: f.numero, objeto: f.objeto, prefijo_orden: f.prefijoOrden,
    // Transporte AAA no trae ficha de contrato: usa sus constantes (IVA excluido).
    valor: f.contrato?.valor ?? (ns === "transporte" ? CONTRACT_VALUE : null),
    inicio: f.contrato?.inicio ?? (ns === "transporte" ? CONTRACT_START_DEFAULT : null),
    fin: f.contrato?.fin ?? (ns === "transporte" ? CONTRACT_END_DEFAULT : null),
    iva_incluido: f.ivaIncluido, creado_en_la_app: false,
  }));
  const dinamicos = parse<ContratoDinamico[]>(await kvGet(KEY_CONTRATOS), []).map((c) => ({
    ns: c.id, nombre: c.nombre, numero: c.numero, objeto: c.objeto, prefijo_orden: c.prefijoOrden,
    valor: c.valor || null, inicio: c.inicio || null, fin: c.fin || null, iva_incluido: c.ivaIncluido, creado_en_la_app: true,
  }));
  return [...base, ...dinamicos];
}

async function contratoValido(ns: string) {
  const lista = await contratos();
  const c = lista.find((x) => x.ns === ns);
  if (!c) throw new ErrorHerramienta(`No existe el contrato «${ns}». Contratos: ${lista.map((x) => x.ns).join(", ")}.`);
  return c;
}

async function tarifarioDe(ns: string): Promise<Tarifario> {
  return parse<Tarifario>(await kvGet(`${prefijo(ns)}tarifario`), tarifarioDefaultDe(ns));
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function registros(args: Record<string, unknown>) {
  const ns = String(args.contrato ?? "").trim();
  const desde = String(args.desde ?? "").trim();
  const hasta = String(args.hasta ?? "").trim();
  if (desde && !FECHA.test(desde)) throw new ErrorHerramienta("«desde» debe tener el formato AAAA-MM-DD.");
  if (hasta && !FECHA.test(hasta)) throw new ErrorHerramienta("«hasta» debe tener el formato AAAA-MM-DD.");
  const contrato = await contratoValido(ns);
  const tar = await tarifarioDe(ns);

  // Meses guardados del contrato (claves '<prefijo>services:AAAA-MM') dentro del rango.
  const pre = `${prefijo(ns)}services:`;
  const { data: claves, error } = await supabaseTransporte().from("transporte_kv").select("key").like("key", `${pre}%`);
  if (error) throw new ErrorHerramienta(`No se pudieron listar los meses: ${error.message}`);
  const meses = (claves ?? []).map((r) => String(r.key).slice(pre.length))
    .filter((mk) => /^\d{4}-\d{2}$/.test(mk) && (!desde || mk >= desde.slice(0, 7)) && (!hasta || mk <= hasta.slice(0, 7)))
    .sort();
  const { data: filas, error: e2 } = meses.length
    ? await supabaseTransporte().from("transporte_kv").select("key, value").in("key", meses.map((m) => pre + m))
    : { data: [], error: null };
  if (e2) throw new ErrorHerramienta(`No se pudieron leer los registros: ${e2.message}`);

  const interventor = String(args.interventor ?? "").trim().toLowerCase();
  const area = String(args.area_aaa ?? "").trim().toLowerCase();
  const pref = String(args.prefacturado ?? "");
  const servicios = (filas ?? []).flatMap((f) => parse<Servicio[]>(f.value as string, []))
    .filter((s) => {
      if (desde && s.date && s.date < desde) return false;
      if (hasta && s.date && s.date > hasta) return false;
      if (interventor && !(s.interventor || "").toLowerCase().includes(interventor)) return false;
      if (area && !areaAAADe(s).toLowerCase().includes(area)) return false;
      if (pref === "si" && !s.prefactura) return false;
      if (pref === "no" && s.prefactura) return false;
      return true;
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.orderNo || "").localeCompare(b.orderNo || ""));

  const conRecargo = ns === "transporte"; // Transporte deduce el recargo del valor; los demás usan las casillas
  const detalle = servicios.map((s) => {
    const cat = findCategoria(tar, s.tarifaCategoria);
    const ruta = findRuta(cat, s.tarifaRuta);
    const rec = conRecargo ? recargosCobrados(s, tar) : { nocturno: !!s.recargoNocturno, dominical: !!s.recargoDominical };
    const v = desgloseValor(s, conRecargo ? tar : null);
    return {
      fecha: s.date, orden: s.orderNo, tipo: s.serviceType,
      item: cat?.label ?? (s.tarifaCategoria ? `(${s.tarifaCategoria})` : "Sin ítem (tarifa manual)"),
      ruta_pliego: ruta?.label ?? (s.tarifaRuta || ""),
      recargo_nocturno: rec.nocturno, recargo_dominical: rec.dominical,
      interventor: s.interventor || "", area_aaa: areaAAADe(s), municipio: s.area || "",
      placa: s.plate || "", conductor: s.driver || "", operario: s.operario || "", equipo: s.equipment || "",
      recogida: s.pickup || "", destino: s.destination || "", hora_solicitud: s.hourReq || "", hora_atencion: s.hourAtt || "",
      horas_maquina: num(s.horasMaquina) || null, valor_hora: num(s.valorHora) || null,
      viajes_equipo: num(s.viajesEquipo) || null, valor_transporte: num(s.valorTransporte) || null, valor_iva: num(s.valorIva) || null,
      valor_base: v.base, valor_recargo_nocturno: v.nocturno, valor_recargo_dominical: v.dominical, valor_total: num(s.value),
      peajes: num(s.tolls), prefactura: s.prefactura || null, facturado: !!s.invoiced,
      evidencia_foto: !!s.photo, vobo_interventor: !!s.approved, aprobado_por: aprobadorDe(s),
      factura_agf: s.facturaAGF || null, observaciones: s.notes || "",
    };
  });

  // Totales por ítem → ruta → recargo y por interventor
  const cond = (d: (typeof detalle)[number]) =>
    d.recargo_nocturno && d.recargo_dominical ? "nocturno_y_dominical" : d.recargo_nocturno ? "nocturno" : d.recargo_dominical ? "dominical" : "sin_recargo";
  const porItem = new Map<string, { item: string; ruta_pliego: string; condicion: string; registros: number; horas: number; valor: number }>();
  const porInterventor = new Map<string, { interventor: string; registros: number; valor: number }>();
  for (const d of detalle) {
    const k = `${d.item}|${d.ruta_pliego}|${cond(d)}`;
    const a = porItem.get(k) ?? { item: d.item, ruta_pliego: d.ruta_pliego, condicion: cond(d), registros: 0, horas: 0, valor: 0 };
    a.registros += 1; a.horas += d.horas_maquina ?? 0; a.valor += d.valor_total;
    porItem.set(k, a);
    const ki = d.interventor || "(sin interventor)";
    const b = porInterventor.get(ki) ?? { interventor: ki, registros: 0, valor: 0 };
    b.registros += 1; b.valor += d.valor_total;
    porInterventor.set(ki, b);
  }

  return {
    contrato: { ns: contrato.ns, nombre: contrato.nombre, numero: contrato.numero },
    filtros: { desde: desde || null, hasta: hasta || null, interventor: args.interventor ?? null, area_aaa: args.area_aaa ?? null, prefacturado: pref || null },
    totales: {
      registros: detalle.length,
      valor_total: detalle.reduce((s, d) => s + d.valor_total, 0),
      peajes: detalle.reduce((s, d) => s + d.peajes, 0),
      horas_maquina: detalle.reduce((s, d) => s + (d.horas_maquina ?? 0), 0),
      sin_prefacturar: detalle.filter((d) => !d.prefactura).length,
    },
    por_item_ruta_recargo: [...porItem.values()].sort((a, b) => a.item.localeCompare(b.item, "es", { numeric: true }) || a.ruta_pliego.localeCompare(b.ruta_pliego, "es")),
    por_interventor: [...porInterventor.values()].sort((a, b) => b.valor - a.valor),
    ...(args.solo_totales ? {} : {
      registros: detalle.slice(0, MAX_REGISTROS),
      ...(detalle.length > MAX_REGISTROS ? { aviso: `Se muestran ${MAX_REGISTROS} de ${detalle.length} registros; acota el rango de fechas o usa solo_totales.` } : {}),
    }),
  };
}

// ── Descripción de los datos ───────────────────────────────────────

function descripcion(): string {
  return `# Plataforma de CONSTRUCTORA ANAYA GIRALDO SAS (AG Constructora)
Datos en pesos colombianos (COP). Fechas AAAA-MM-DD. Responde en español.

# Herramientas
- consultar_sql: SELECT de solo lectura sobre la base principal (tablas descritas abajo, salvo transporte_kv). Máximo 300 filas por consulta.
- listar_contratos / consultar_registros / tarifario_contrato: contratos de Proyecto Triple A y sus registros (servicios/órdenes), con ítem y ruta del pliego, recargos nocturno y dominical/festivo, interventor y área AAA. Cada contrato es independiente: nunca sumes contratos distintos salvo que te lo pidan.

# Esquema de la base principal (schema public)
${ESQUEMA_CARTERA}
${ESQUEMA_PROSPECTOS}
${ESQUEMA_MARKETING}
${ESQUEMA_AAA.split("## transporte_kv")[0].trim()}
(Los registros de los contratos — transporte_kv — se consultan con consultar_registros, no con SQL.)

# Reglas de cálculo que usa la app (respétalas para que tus cifras coincidan)
${REGLAS_CALCULO}
- Proyecto Triple A: el valor de un registro es valor_total; en Transporte AAA = valor de la ruta del pliego + recargos; en Alquiler y contratos creados en la app = horas máquina × valor hora + transporte del equipo (+ IVA según el contrato).`;
}

// ── Ejecución ──────────────────────────────────────────────────────

/** Tablas que consultar_sql puede tocar: todas las conocidas salvo transporte_kv (vive en otro Supabase). */
const TABLAS_SQL = new Set(TODAS_LAS_TABLAS.filter((t) => t !== "transporte_kv"));

export async function ejecutarHerramienta(nombre: string, args: Record<string, unknown>): Promise<string> {
  switch (nombre) {
    case "describir_datos":
      return descripcion();
    case "consultar_sql": {
      const sql = String(args.sql ?? "").trim();
      if (!sql) throw new ErrorHerramienta("Falta la consulta (sql).");
      if (/\btransporte_kv\b/i.test(sql)) throw new ErrorHerramienta("Los registros de los contratos de Proyecto Triple A se consultan con consultar_registros (transporte_kv no está en esta base).");
      const motivo = validarAlcanceSql(sql, TABLAS_SQL);
      if (motivo) throw new ErrorHerramienta(motivo);
      const { data, error } = await supabaseAdmin().rpc("asistente_consulta", { q: sql });
      if (error) throw new ErrorHerramienta(error.message);
      const filas = Array.isArray(data) ? data : [];
      return JSON.stringify({ filas: filas.length, datos: filas, ...(filas.length >= 300 ? { aviso: "Resultado truncado a 300 filas: agrega filtros o agregaciones." } : {}) });
    }
    case "listar_contratos":
      return JSON.stringify(await contratos());
    case "consultar_registros":
      return JSON.stringify(await registros(args));
    case "tarifario_contrato": {
      const ns = String(args.contrato ?? "").trim();
      const c = await contratoValido(ns);
      const t = await tarifarioDe(ns);
      return JSON.stringify({
        contrato: { ns: c.ns, nombre: c.nombre },
        recargos: { nocturno: num(t.recargos.nocturno), dominical_festivo: num(t.recargos.dominicalFestivo) },
        items: t.categorias.map((cat) => ({ id: cat.id, item: cat.label, capacidad: num(cat.capacidad) || null, rutas: cat.rutas.map((r) => ({ id: r.id, ruta_pliego: r.label, valor_unitario: num(r.unitario) })) })),
      });
    }
    default:
      throw new ErrorHerramienta(`Herramienta desconocida: ${nombre}`);
  }
}
