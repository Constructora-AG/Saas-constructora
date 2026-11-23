// ════════════════════════════════════════════════════════════════════
// Validación en el servidor de lo que se guarda en el Contrato de Recolección
// (espacio "recoleccion:" de transporte_kv, adjuntos y prefacturas).
//
// El cliente guarda MESES COMPLETOS (y la Administración como un solo objeto):
// para no bloquear un mes por registros antiguos —traídos del contrato que se
// creó desde la app—, solo se validan los registros, vehículos y personas que
// cambian respecto a lo guardado. Lo que no cambia pasa tal cual.
// ════════════════════════════════════════════════════════════════════

import { ACTIVIDADES_RECOLECCION, MAX_AYUDANTES_RECOLECCION, SAVE_BLOCK_CHARS, volquetaDe } from "./constants";

/** Claves que el módulo escribe (sin el prefijo "recoleccion:"). */
const CLAVE_MES = /^services:(\d{4})-(0[1-9]|1[0-2])$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPOS_SERVICIO = new Set(["", "Programado", "No Programado", "Emergencia"]);
/** Tope razonable de una jornada registrada por horómetro (un servicio, un día). */
export const MAX_HORAS_SERVICIO = 24;
/** Tope del valor hora sin IVA, para atrapar errores de digitación (ceros de más). */
export const MAX_VALOR_HORA = 5_000_000;

export type ResultadoValidacion = { error: string } | null;

const mal = (error: string): ResultadoValidacion => ({ error });
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Número opcional (string del formulario o number): null = vacío; NaN = inválido. */
function numero(v: unknown): number | null {
  if (vacio(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

function fechaValida(s: string): boolean {
  if (!FECHA.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
}

function texto(v: unknown, max: number, campo: string, ctx: string): ResultadoValidacion {
  if (vacio(v)) return null;
  if (typeof v !== "string") return mal(`${ctx}: «${campo}» debe ser texto.`);
  if (v.length > max) return mal(`${ctx}: «${campo}» supera ${max} caracteres.`);
  return null;
}

/** Clave permitida para escribir en el espacio de Recolección (sin prefijo). */
export function claveRecoleccionValida(rel: string): boolean {
  return rel === "adminconfig" || rel === "tarifario" || CLAVE_MES.test(rel);
}

// ── Registros (services:AAAA-MM) ────────────────────────────────────

/** Valida UN registro de servicio de Recolección. */
export function validarServicioRecoleccion(s: unknown, mes: string, idx: number): ResultadoValidacion {
  if (!esObjeto(s)) return mal(`Registro ${idx + 1}: formato inválido.`);
  const ctx = `Registro ${s.orderNo ? String(s.orderNo) : idx + 1}`;
  if (typeof s.id !== "string" || !s.id.trim()) return mal(`${ctx}: falta el identificador.`);
  if (typeof s.date !== "string" || !fechaValida(s.date)) return mal(`${ctx}: la fecha no es válida.`);
  if (!s.date.startsWith(`${mes}-`)) return mal(`${ctx}: la fecha ${s.date} no pertenece al mes ${mes}.`);
  if (!TIPOS_SERVICIO.has(String(s.serviceType ?? ""))) return mal(`${ctx}: tipo de servicio no válido.`);

  for (const campo of ["value", "valorIva", "valorHora", "horasMaquina", "horometroInicial", "horometroFinal", "tolls"] as const) {
    const n = numero(s[campo]);
    if (n !== null && (Number.isNaN(n) || n < 0)) return mal(`${ctx}: «${campo}» debe ser un número mayor o igual a 0.`);
  }
  const ini = numero(s.horometroInicial), fin = numero(s.horometroFinal), horas = numero(s.horasMaquina);
  if (ini !== null && fin !== null && fin < ini) return mal(`${ctx}: el horómetro final no puede ser menor que el inicial.`);
  if (horas !== null && horas > MAX_HORAS_SERVICIO) return mal(`${ctx}: ${horas} h efectivas superan el máximo de ${MAX_HORAS_SERVICIO} h por servicio.`);
  if (ini !== null && fin !== null && horas !== null && Math.abs(horas - (fin - ini)) > 0.01) {
    return mal(`${ctx}: las horas efectivas (${horas}) no coinciden con el horómetro (${fin} − ${ini}).`);
  }
  // Valor = horas × valor hora (sin IVA); IVA 19% sobre ese valor (la tarifa del contrato incluye IVA).
  const vh = numero(s.valorHora), valor = numero(s.value), iva = numero(s.valorIva);
  if (horas !== null && vh !== null && vh > 0 && valor !== null && Math.abs(valor - Math.round(horas * vh)) > 1) {
    return mal(`${ctx}: el valor (${valor}) no corresponde a ${horas} h × ${vh}.`);
  }
  if (s.ivaAlquiler === false) return mal(`${ctx}: el contrato incluye IVA; el servicio debe llevar IVA del 19%.`);
  if (valor !== null && iva !== null && Math.abs(iva - Math.round(valor * 0.19)) > 1) {
    return mal(`${ctx}: el IVA (${iva}) no corresponde al 19% del valor (${valor}).`);
  }
  const peajes = numero(s.tolls);
  if (peajes !== null && peajes > 0) return mal(`${ctx}: los peajes van incluidos en la hora del contrato; no se cobran aparte.`);

  for (const campo of ["horaSalida", "horaRetorno", "hourReq", "hourAtt"] as const) {
    if (!vacio(s[campo]) && !HORA.test(String(s[campo]))) return mal(`${ctx}: «${campo}» debe tener el formato HH:MM.`);
  }
  if (!vacio(s.actividad) && !ACTIVIDADES_RECOLECCION.includes(String(s.actividad))) {
    return mal(`${ctx}: la actividad «${String(s.actividad)}» no es de la planilla de despacho.`);
  }
  if (s.ayudantes !== undefined) {
    if (!Array.isArray(s.ayudantes) || s.ayudantes.some((a) => typeof a !== "string")) return mal(`${ctx}: los ayudantes deben ser una lista de nombres.`);
    if (s.ayudantes.length > MAX_AYUDANTES_RECOLECCION) return mal(`${ctx}: máximo ${MAX_AYUDANTES_RECOLECCION} ayudantes por servicio.`);
    if (s.ayudantes.length > 0 && volquetaDe(String(s.equipment ?? "")) === "dobletroque") {
      return mal(`${ctx}: los ayudantes solo aplican a la volqueta sencilla.`);
    }
  }
  const textos: Array<[string, number]> = [["planilla", 40], ["numeroInterno", 20], ["ruta", 120], ["plate", 15], ["driver", 120], ["interventor", 120], ["areaAAA", 120], ["area", 120], ["destination", 200], ["notes", 2000]];
  for (const [campo, max] of textos) {
    const r = texto(s[campo], max, campo, ctx);
    if (r) return r;
  }
  for (const adj of [...(Array.isArray(s.photoFiles) ? s.photoFiles : []), s.approvalFile].filter(Boolean)) {
    if (!esObjeto(adj)) return mal(`${ctx}: adjunto con formato inválido.`);
    if (!vacio(adj.url) && !/^https:\/\//i.test(String(adj.url))) return mal(`${ctx}: el adjunto «${String(adj.name ?? "")}» debe ser una URL https.`);
    if (!vacio(adj.dataUrl)) return mal(`${ctx}: el adjunto «${String(adj.name ?? "")}» debe subirse a Storage antes de guardar.`);
  }
  return null;
}

/** Valida el mes completo: solo los registros nuevos o modificados respecto a lo guardado. */
export function validarMesRecoleccion(rel: string, value: unknown, anterior: unknown): ResultadoValidacion {
  const m = CLAVE_MES.exec(rel);
  if (!m) return mal("Clave de mes inválida.");
  if (!Array.isArray(value)) return mal("Los registros del mes deben ser una lista.");
  const mes = `${m[1]}-${m[2]}`;
  const previos = new Map<string, unknown>();
  if (Array.isArray(anterior)) anterior.forEach((s) => { if (esObjeto(s) && typeof s.id === "string") previos.set(s.id, s); });
  const ids = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const s = value[i];
    const id = esObjeto(s) && typeof s.id === "string" ? s.id : "";
    if (id && ids.has(id)) return mal(`Registro ${i + 1}: identificador repetido en el mes.`);
    if (id) ids.add(id);
    if (id && previos.has(id) && igual(previos.get(id), s)) continue; // sin cambios: no se revalida
    const r = validarServicioRecoleccion(s, mes, i);
    if (r) return r;
  }
  return null;
}

// ── Tarifario ───────────────────────────────────────────────────────

export function validarTarifarioRecoleccion(value: unknown): ResultadoValidacion {
  if (!esObjeto(value) || !Array.isArray(value.categorias)) return mal("El tarifario debe tener la lista de categorías.");
  if (value.categorias.length > 20) return mal("El tarifario admite máximo 20 categorías.");
  // Los recargos no se validan: el contrato no los tiene y el registro de recolección no los aplica.
  const idsCat = new Set<string>();
  for (const c of value.categorias) {
    if (!esObjeto(c) || typeof c.id !== "string" || !c.id || typeof c.label !== "string" || !c.label.trim()) return mal("Categoría del tarifario sin identificador o nombre.");
    if (idsCat.has(c.id)) return mal(`Categoría repetida en el tarifario: ${c.id}.`);
    idsCat.add(c.id);
    if (!Array.isArray(c.rutas)) return mal(`«${c.label}»: falta la lista de tarifas.`);
    const idsRuta = new Set<string>();
    for (const r of c.rutas) {
      if (!esObjeto(r) || typeof r.id !== "string" || !r.id || typeof r.label !== "string" || !r.label.trim()) return mal(`«${c.label}»: tarifa sin identificador o nombre.`);
      if (idsRuta.has(r.id)) return mal(`«${c.label}»: tarifa repetida ${r.id}.`);
      idsRuta.add(r.id);
      const u = numero(r.unitario) ?? 0;
      if (Number.isNaN(u) || u < 0) return mal(`«${c.label} · ${r.label}»: el valor debe ser un número mayor o igual a 0.`);
      if (u > MAX_VALOR_HORA) return mal(`«${c.label} · ${r.label}»: ${u} supera el valor hora máximo esperado; revisa la digitación (va sin IVA).`);
    }
  }
  return null;
}

// ── Administración (adminconfig) ────────────────────────────────────

export function validarAdminRecoleccion(value: unknown, anterior: unknown): ResultadoValidacion {
  if (!esObjeto(value)) return mal("La configuración del módulo no tiene un formato válido.");
  const prev = esObjeto(anterior) ? anterior : {};
  for (const campo of ["areas", "interventores", "vehiculos", "personal", "equipos", "festivosCustom"] as const) {
    if (value[campo] !== undefined && !Array.isArray(value[campo])) return mal(`«${campo}» debe ser una lista.`);
  }
  // Vigencia y valor: solo si cambian.
  if (!igual(value.contractStart, prev.contractStart) || !igual(value.contractEnd, prev.contractEnd)) {
    const ini = String(value.contractStart ?? ""), fin = String(value.contractEnd ?? "");
    if (ini && !fechaValida(ini)) return mal("La fecha de inicio (acta de inicio) no es válida.");
    if (fin && !fechaValida(fin)) return mal("La fecha de fin no es válida.");
    if (ini && fin && fin <= ini) return mal("La fecha de fin debe ser posterior a la de inicio.");
  }
  if (!igual(value.contractValue, prev.contractValue)) {
    const v = numero(value.contractValue);
    if (v !== null && (Number.isNaN(v) || v < 0)) return mal("El valor del contrato debe ser un número mayor o igual a 0.");
  }
  const listaTextos = (campo: "areas" | "interventores") => (Array.isArray(value[campo]) ? (value[campo] as unknown[]) : []);
  for (const campo of ["areas", "interventores"] as const) {
    if (listaTextos(campo).some((x) => typeof x !== "string" || !x.trim() || x.length > 120)) return mal(`«${campo}»: cada elemento debe ser un texto de máximo 120 caracteres.`);
  }
  // Vehículos y personas: solo los nuevos o modificados.
  const previos = (lista: unknown, clave: string) => new Map((Array.isArray(lista) ? lista : []).filter(esObjeto).map((x) => [String(x[clave] ?? ""), x] as const));
  const vehPrev = previos(prev.vehiculos, "plate");
  const placas = new Set<string>();
  const anio = new Date().getFullYear();
  for (const v of (value.vehiculos as unknown[] | undefined) ?? []) {
    if (!esObjeto(v) || typeof v.plate !== "string" || !v.plate.trim()) return mal("Vehículo sin placa.");
    if (placas.has(v.plate)) return mal(`Placa repetida en la flota: ${v.plate}.`);
    placas.add(v.plate);
    if (igual(vehPrev.get(v.plate), v)) continue;
    const ctx = `Vehículo ${v.plate}`;
    if (!/^[A-Z0-9-]{4,10}$/.test(v.plate)) return mal(`${ctx}: la placa solo admite letras mayúsculas, números y guion.`);
    const cap = numero(v.capacity);
    if (cap !== null && (Number.isNaN(cap) || cap < 0 || cap > 60)) return mal(`${ctx}: la capacidad del volco debe estar entre 0 y 60 m³.`);
    const mod = numero(v.modelo);
    if (mod !== null && (Number.isNaN(mod) || !Number.isInteger(mod) || mod < 1950 || mod > anio + 1)) return mal(`${ctx}: el modelo debe ser un año entre 1950 y ${anio + 1}.`);
    for (const f of ["venceSoat", "venceTecno"] as const) {
      if (!vacio(v[f]) && !fechaValida(String(v[f]))) return mal(`${ctx}: «${f}» no es una fecha válida.`);
    }
    const r = texto(v.numeroInterno, 20, "N° interno", ctx) ?? texto(v.tipo, 60, "tipo", ctx) ?? texto(v.driver, 120, "conductor", ctx);
    if (r) return r;
  }
  const perPrev = previos(prev.personal, "nombre");
  const nombres = new Set<string>();
  for (const p of (value.personal as unknown[] | undefined) ?? []) {
    if (!esObjeto(p) || typeof p.nombre !== "string" || !p.nombre.trim()) return mal("Persona sin nombre en el catálogo de personal.");
    if (nombres.has(p.nombre)) return mal(`Persona repetida en el catálogo: ${p.nombre}.`);
    nombres.add(p.nombre);
    if (igual(perPrev.get(p.nombre), p)) continue;
    const ctx = `Personal ${p.nombre}`;
    if (p.nombre.length > 120) return mal(`${ctx}: el nombre supera 120 caracteres.`);
    if (p.rol !== undefined && p.rol !== "conductor" && p.rol !== "ayudante") return mal(`${ctx}: el rol debe ser conductor o ayudante.`);
    if (p.arlNivelV !== undefined && typeof p.arlNivelV !== "boolean") return mal(`${ctx}: «ARL nivel V» debe ser sí o no.`);
    if (!vacio(p.venceLicencia) && !fechaValida(String(p.venceLicencia))) return mal(`${ctx}: la fecha de la licencia no es válida.`);
    if (!vacio(p.cedula) && !/^[0-9A-Za-z.-]{3,20}$/.test(String(p.cedula))) return mal(`${ctx}: el N° de identificación no es válido.`);
  }
  return null;
}

// ── Entrada única para POST /api/aaa/transporte ─────────────────────

/**
 * Valida una escritura en el espacio de Recolección.
 * `rel` es la clave sin el prefijo; `anterior` es el valor guardado (o null).
 */
export function validarEscrituraRecoleccion(rel: string, value: string, anterior: string | null): ResultadoValidacion {
  if (!claveRecoleccionValida(rel)) return mal(`La clave «${rel}» no es del Contrato de Recolección.`);
  if (value.length > SAVE_BLOCK_CHARS) return mal("El contenido supera el tamaño máximo permitido por mes.");
  const datos = parse(value);
  if (datos === null) return mal("El contenido no es JSON válido.");
  if (rel === "tarifario") return validarTarifarioRecoleccion(datos);
  if (rel === "adminconfig") return validarAdminRecoleccion(datos, parse(anterior));
  return validarMesRecoleccion(rel, datos, parse(anterior));
}

// ── Adjuntos (POST /api/aaa/transporte/adjunto) ─────────────────────

const TIPOS_ADJUNTO = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;

/** Recolección: las evidencias y el V°B° son fotos o PDF (no HTML, scripts ni ejecutables). */
export function validarAdjuntoRecoleccion(tipoDeclarado: string, tipoDataUrl: string | undefined, monthKey: unknown, serviceId: unknown): ResultadoValidacion {
  if (!TIPOS_ADJUNTO.test(tipoDeclarado)) return mal("Solo se permiten fotos (JPG, PNG, WEBP, HEIC) o PDF como evidencia.");
  if (tipoDataUrl && tipoDataUrl.toLowerCase() !== tipoDeclarado.toLowerCase()) return mal("El tipo del archivo no coincide con su contenido declarado.");
  if (!CLAVE_MES.test(`services:${String(monthKey ?? "")}`)) return mal("Falta el mes (AAAA-MM) del registro al que pertenece el adjunto.");
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(String(serviceId ?? ""))) return mal("Falta el identificador del registro al que pertenece el adjunto.");
  return null;
}

// ── Prefacturas (POST / PATCH /api/aaa/prefacturas) ─────────────────

/** Ítems de prefactura de Recolección: horas o servicios con valor > 0 y siempre IVA 19%. */
export function validarItemsPrefacturaRecoleccion(items: unknown): ResultadoValidacion {
  if (!Array.isArray(items) || items.length === 0) return mal("La prefactura necesita al menos un ítem.");
  for (const it of items) {
    if (!esObjeto(it)) return mal("Ítem de prefactura con formato inválido.");
    const nombre = String(it.item ?? "").trim() || "ítem";
    const vr = numero(it.vr_unit);
    if (vr === null || Number.isNaN(vr) || vr <= 0) return mal(`«${nombre}»: el valor unitario debe ser mayor que 0 (revisa el tarifario).`);
    if (it.iva_pct !== undefined && Number(it.iva_pct) !== 0.19) return mal(`«${nombre}»: el contrato de recolección incluye IVA; el ítem debe llevar 19%.`);
    const unidad = String(it.unidad ?? "HR").toUpperCase();
    const cant = numero(it.cantidad);
    if (unidad === "HR" && cant !== null && cant > MAX_HORAS_SERVICIO * 31 * 10) return mal(`«${nombre}»: ${cant} h es una cantidad fuera de rango.`);
  }
  return null;
}

/** Fechas de una prefactura de Recolección (generación y periodo). */
export function validarFechasPrefacturaRecoleccion(b: { fecha_generacion?: unknown; periodo_desde?: unknown; periodo_hasta?: unknown }): ResultadoValidacion {
  if (b.fecha_generacion !== undefined && !fechaValida(String(b.fecha_generacion ?? ""))) return mal("La fecha de generación no es válida (AAAA-MM-DD).");
  const desde = vacio(b.periodo_desde) ? "" : String(b.periodo_desde);
  const hasta = vacio(b.periodo_hasta) ? "" : String(b.periodo_hasta);
  if (desde && !fechaValida(desde)) return mal("La fecha inicial del periodo no es válida.");
  if (hasta && !fechaValida(hasta)) return mal("La fecha final del periodo no es válida.");
  if (desde && hasta && hasta < desde) return mal("El periodo termina antes de empezar.");
  return null;
}
