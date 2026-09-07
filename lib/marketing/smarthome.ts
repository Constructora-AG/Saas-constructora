// Mapea las respuestas crudas de la BI de Smarthome a las filas espejo.
// getDigitalRecords trae columnas dinámicas con prefijo de fuente:
//   "[whatsapp].source id", "[facebook leads ad].ad id", "[instagram].headline", …
import { canonicalAsesor, esVendedorReal } from "@/lib/smarthome/asesores";

type Raw = Record<string, unknown>;

const PREFIJOS = ["[whatsapp]", "[facebook leads ad]", "[instagram]", "[página web]", "[pagina web]"];

// Primer valor no vacío de `[prefijo].<campo>` en cualquiera de las fuentes.
function campo(r: Raw, ...nombres: string[]): string {
  for (const n of nombres) {
    for (const p of PREFIJOS) {
      const v = r[`${p}.${n}`];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    const directo = r[n];
    if (directo !== undefined && directo !== null && String(directo).trim() !== "") return String(directo).trim();
  }
  return "";
}

const siNo = (v: string): string => {
  const s = v.toLowerCase().replace(/_/g, " ").trim();
  if (!s) return "";
  if (/^s[ií]/.test(s)) return "Sí";
  if (/^no lo/.test(s)) return "No lo sé";
  if (/^no/.test(s)) return "No";
  return v;
};
const limpio = (v: string) => v.replace(/_/g, " ").replace(/\s+/g, " ").trim();
const empleoNorm = (v: string): string => {
  const s = limpio(v).toLowerCase();
  if (!s) return "";
  if (s.startsWith("emplead")) return "Empleado";
  if (s.startsWith("independ")) return "Independiente";
  if (s.startsWith("pension")) return "Pensionado";
  return cap(s);
};
const cap = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v);

export function mapDigitalRecord(r: Raw): Record<string, unknown> {
  const adId = campo(r, "source id", "ad id");
  const canal = String(r.LocationSource ?? "").trim();
  const medio = String(r.Medium ?? "").trim() || (canal.startsWith("Insta") ? "ig" : canal.startsWith("Face") ? "fb" : "");
  const owner = String(r.Owner ?? "");
  const etapa = String(r.Stage ?? "").trim();
  const ciclo = String(r.SaleCycle ?? "").trim();
  return {
    id: String(r.Id ?? `${r.ProspectId}-${r.CreationDate}`),
    prospect_id: (r.ProspectId as string) ?? null,
    customer_id: (r.CustomerId as string) ?? null,
    proyecto: String(r.Project ?? "").trim(),
    canal,
    medio,
    campana: String(r.Campaign ?? "").trim() || campo(r, "campaign"),
    ad_id: adId,
    ad_titulo: campo(r, "headline").replace(/\s+$/, ""),
    ad_tipo: campo(r, "media type"),
    ad_url: campo(r, "video url", "source url"),
    ad_miniatura: campo(r, "thumbnail url", "image url"),
    formulario: campo(r, "form name"),
    asesor: esVendedorReal(owner) ? canonicalAsesor(owner) : "",
    asesor_raw: owner,
    fecha_creacion: (r.CreationDate as string) || null,
    primera_accion: (r.FirstActionDate as string) || null,
    horas_primera_accion: typeof r.FirstActionHours === "number" ? r.FirstActionHours : null,
    ciclo,
    etapa,
    probabilidad: Number(r.Probability ?? 0) || 0,
    es_venta: Number(r.IsSale ?? 0) === 1 || /^compra/i.test(etapa) || /compra/i.test(ciclo),
    es_unico: Number(r.IsUniqueRecord ?? 1) === 1,
    cliente_existente: Number(r.IsExistingCustomer ?? 0) === 1,
    fecha_cierre: (r.CloseDate as string) || null,
    credito_aprobado: siNo(campo(r, "¿cuentas con crédito aprobado?", "cuentas con crédito aprobado", "credito aprobado")),
    empleo: empleoNorm(campo(r, "¿empleado o independiente?", "¿qué tipo de cliente eres?", "tipo de cliente")),
    reportado: siNo(campo(r, "¿tienes reportes negativos en centrales de riesgo?", "¿cómo te encuentras en centrales de riesgos?")),
    capacidad_pago: cap(limpio(campo(r, "¿cuál es tu capacidad de pago de cuotas mensuales?", "¿cuál de estas opciones describe mejor tus ingresos?"))),
    motivacion: cap(limpio(campo(r, "¿cuál es tu motivación de compra?"))),
    tiempo_compra: cap(limpio(campo(r, "¿en cuánto tiempo piensas comprar?"))),
    synced_at: new Date().toISOString(),
  };
}

// getProspectDetail → columnas enriquecidas de sh_prospectos.
export function mapProspectDetail(r: Raw): Record<string, unknown> {
  const etapa = String(r.Etapa_del_Ciclo ?? "").trim();
  const ciclo = String(r.Ciclo_de_Venta ?? "").trim();
  const asesor = String(r.Asesor ?? "");
  const acciones: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("Accion: ") && typeof v === "number" && v > 0) {
      acciones[k.slice(8)] = v;
      total += v;
    }
  }
  const txt = (k: string) => {
    const v = r[k];
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s && s !== "Ciudad:" ? s : null;
  };
  const edad = Number(r.Edad ?? 0);
  return {
    prospect_id: r.ProspectId,
    asesor: esVendedorReal(asesor) ? canonicalAsesor(asesor) : "",
    asesor_raw: asesor,
    proyecto: String(r.Proyecto ?? "").trim(),
    etapa,
    ciclo,
    valor: Number(r.Valor_Ofertado ?? 0) || 0,
    celular: r.Celular ?? "",
    email: r.Email ?? "",
    fecha_creacion: (r.Fecha_de_Creacion as string) || null,
    es_venta: /^compra/i.test(etapa) || /compra/i.test(ciclo),
    nombre: txt("Nombre_del_Cliente"),
    genero: txt("Genero"),
    edad: edad > 0 ? edad : null,
    fecha_nacimiento: r.Fecha_de_Nacimiento ? String(r.Fecha_de_Nacimiento).slice(0, 10) : null,
    ocupacion: txt("Ocupacion"),
    profesion: txt("Profesion"),
    cargo: txt("CARGO"),
    empresa: txt("Empresa_/_Razon_Social") ?? txt("EMPRESA"),
    barrio: txt("Barrio"),
    ciudad: txt("Ciudad") ?? txt("CIUDAD"),
    estado_civil: txt("Estado_Civil"),
    tipo_cliente: typeof r.Tipo_de_Cliente === "number" ? r.Tipo_de_Cliente : null,
    fuente: txt("Fuente_de_Ubicacion_Prospecto") ?? txt("Fuente_de_Ubicacion_Cliente"),
    probabilidad: Number(r.Probabilidad ?? 0) || 0,
    fecha_cierre: (r.Fecha_de_Cierre as string) || null,
    seguimiento: typeof r.Seguimiento === "number" ? r.Seguimiento : null,
    estado_credito: txt("Estado_del_Credito"),
    score: Number(r.Score_del_Prospecto ?? 0) || 0,
    digital: Number(r.Digital ?? 0) === 1,
    campana: txt("Digital_Campaña"),
    medio: txt("Digital_Medio"),
    medio_atencion: txt("Medio_de_Atencion"),
    visita_sala: Number(r.Visita_Sala_de_Negocios ?? 0) || 0,
    reportado: txt("¿Esta_reportado?"),
    sisben: txt("Sisben") ?? txt("¿Cuenta_con_sisben?"),
    acciones: total,
    acciones_detalle: acciones,
    synced_at: new Date().toISOString(),
  };
}
