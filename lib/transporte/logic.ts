// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Lógica pura (sin React, sin red)
// Meses de la vigencia, recargos automáticos, valor desde tarifario,
// tiempo de respuesta, alertas contractuales y formato es-CO.
// ════════════════════════════════════════════════════════════════════

import { CONTRACT_MONTHS, CONTRACT_VALUE, allFestivos } from "./constants";
import type {
  AdminConfig,
  Alerta,
  FestivoCustom,
  MonthInfo,
  Servicio,
  Tarifario,
  TarifarioCategoria,
  TarifarioRuta,
} from "./model";
import { areaAAADe, num } from "./model";

// ── Formato es-CO ──────────────────────────────────────────────────

export const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** '$' + entero es-CO (mismo formato del panel original). */
export function fmtCOP(n: number | string | null | undefined): string {
  return "$" + Math.round(num(n)).toLocaleString("es-CO");
}

/** Moneda abreviada para barras/tablas densas (patrón AaaClient). */
export function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)} mil M`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return COP.format(n);
}

/** 'AAAA-MM-DD' → '12 ago 2026' (siempre con T00:00:00 para evitar corrimiento UTC). */
export function fdate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export const fmtF = (s: string | null | undefined) => (s ? fdate(s) : "—");

export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 'AAAA-MM' → 'jul 26'. */
export function fmtMes(m: string): string {
  const [y, mm] = m.split("-");
  return `${MESES_CORTOS[+mm - 1]} ${y.slice(2)}`;
}

/** slug para nombres de archivo: NFD sin diacríticos, no-alfanumérico → '_', lowercase. */
export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

// ── Meses de la vigencia ───────────────────────────────────────────

/** Clave de mes 'AAAA-MM'. */
export function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/**
 * Aplica las fechas del contrato como el panel original:
 * la fecha fin del formulario es INCLUSIVA (endExclusive = último día + 1);
 * sin fin válida, respaldo = inicio + CONTRACT_MONTHS meses.
 * Devuelve los meses calendario de la vigencia y la firma para el polling.
 */
export function applyContractDates(startStr: string, endStr: string): {
  start: Date;
  endExclusive: Date;
  months: MonthInfo[];
  signature: string;
} {
  const parse = (s: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const start = parse(startStr) ?? new Date(2026, 6, 1);
  const endIncl = parse(endStr);
  const endExclusive = endIncl
    ? new Date(endIncl.getFullYear(), endIncl.getMonth(), endIncl.getDate() + 1)
    : new Date(start.getFullYear(), start.getMonth() + CONTRACT_MONTHS, start.getDate());

  const months: MonthInfo[] = [];
  const last = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);
  let y = start.getFullYear();
  let m = start.getMonth();
  while (y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth())) {
    months.push({
      year: y,
      month: m,
      key: monthKey(y, m),
      label: new Date(y, m, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
    });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return { start, endExclusive, months, signature: `${startStr}|${endStr}` };
}

/** Índice del mes actual dentro de la vigencia, o 0 si está fuera. */
export function currentMonthIdx(months: MonthInfo[], today = new Date()): number {
  const k = monthKey(today.getFullYear(), today.getMonth());
  const i = months.findIndex((m) => m.key === k);
  return i >= 0 ? i : 0;
}

/** Estado del contrato para la cabecera + % de tiempo transcurrido. */
export function contractStatus(start: Date, endExclusive: Date, today = new Date()): {
  label: string;
  activo: boolean;
  pctTiempo: number; // 0-100
} {
  const day = 86400000;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const totalDays = Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / day));
  if (t0 < start.getTime()) {
    const dias = Math.ceil((start.getTime() - t0) / day);
    return { label: `Inicia en ${dias} día(s)`, activo: false, pctTiempo: 0 };
  }
  if (t0 >= endExclusive.getTime()) return { label: "Contrato finalizado", activo: false, pctTiempo: 100 };
  const elapsed = Math.round((t0 - start.getTime()) / day) + 1;
  const pct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
  return { label: `Día ${elapsed} de ${totalDays} · ${pct.toFixed(1)}% del plazo`, activo: true, pctTiempo: pct };
}

// ── Tiempo de respuesta (§4.1) ─────────────────────────────────────

/**
 * Horas entre solicitud y atención (2 decimales). Diferencias negativas suman
 * 24 h (se asume cruce de medianoche). null si falta alguna hora.
 */
export function respHours(hourReq: string, hourAtt: string): number | null {
  if (!hourReq || !hourAtt) return null;
  const [h1, m1] = hourReq.split(":").map(Number);
  const [h2, m2] = hourAtt.split(":").map(Number);
  if (![h1, m1, h2, m2].every(Number.isFinite)) return null;
  let diff = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diff < 0) diff += 1440;
  return +(diff / 60).toFixed(2);
}

// ── Recargos automáticos (§4.2) ────────────────────────────────────

export interface RecargoAuto {
  aplica: boolean;
  /** motivo legible: 'festivo — <label>' | 'sábado' | 'domingo' | 'horario nocturno (19:00–06:00)' */
  motivo: string | null;
}

/** ¿Es nocturno? hora de referencia = hourAtt (o hourReq si no hay atención). 19:00–06:00. */
export function recargoNocturno(hourAtt: string, hourReq: string): RecargoAuto {
  const hora = hourAtt || hourReq;
  if (!hora) return { aplica: false, motivo: null };
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { aplica: false, motivo: null };
  const min = h * 60 + m;
  const aplica = min >= 19 * 60 || min < 6 * 60;
  return { aplica, motivo: aplica ? "horario nocturno (19:00–06:00)" : null };
}

/** ¿Es dominical/festivo? sábado, domingo o fecha en festivos (oficiales + custom). */
export function recargoDominical(dateStr: string, festivos: FestivoCustom[]): RecargoAuto {
  if (!dateStr) return { aplica: false, motivo: null };
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { aplica: false, motivo: null };
  const fest = festivos.find((f) => f.date === dateStr);
  if (fest) return { aplica: true, motivo: `festivo — ${fest.label}` };
  const dow = d.getDay();
  if (dow === 6) return { aplica: true, motivo: "sábado" };
  if (dow === 0) return { aplica: true, motivo: "domingo" };
  return { aplica: false, motivo: null };
}

/**
 * Evalúa ambos recargos automáticos respetando los flags `touched`
 * (un ajuste manual del checkbox prevalece: el autocálculo no lo toca más).
 * Devuelve el estado final de los checkboxes y la nota visible.
 */
export function autoRecargos(input: {
  date: string;
  hourReq: string;
  hourAtt: string;
  nocturnoActual: boolean;
  dominicalActual: boolean;
  nocturnoTouched: boolean;
  dominicalTouched: boolean;
  admin: Pick<AdminConfig, "festivosCustom"> | null;
}): { nocturno: boolean; dominical: boolean; nota: string | null } {
  const motivos: string[] = [];
  let noct = input.nocturnoActual;
  let dom = input.dominicalActual;
  if (!input.dominicalTouched) {
    const r = recargoDominical(input.date, allFestivos(input.admin));
    if (r.aplica) { dom = true; if (r.motivo) motivos.push(r.motivo); } else dom = false;
  }
  if (!input.nocturnoTouched) {
    const r = recargoNocturno(input.hourAtt, input.hourReq);
    if (r.aplica) { noct = true; if (r.motivo) motivos.push(r.motivo); } else noct = false;
  }
  const nota = motivos.length
    ? `Recargo marcado automáticamente por ${motivos.join(" y ")}. Desmárcalo si no aplica en este servicio.`
    : null;
  return { nocturno: noct, dominical: dom, nota };
}

// ── Valor desde tarifario (§4.3) ───────────────────────────────────

export function findCategoria(t: Tarifario, catId: string | null): TarifarioCategoria | null {
  return t.categorias.find((c) => c.id === catId) ?? null;
}

export function findRuta(cat: TarifarioCategoria | null, rutaId: string | null): TarifarioRuta | null {
  return cat?.rutas.find((r) => r.id === rutaId) ?? null;
}

/**
 * Recalcula el valor del servicio desde el tarifario. null cuando la tarifa es
 * manual (categoría vacía o 'manual') — no tocar el valor en ese caso.
 */
export function computeValor(
  t: Tarifario,
  catId: string | null,
  rutaId: string | null,
  nocturno: boolean,
  dominical: boolean,
): { capacidad: number; total: number | null; hint: string | null } | null {
  if (!catId || catId === "manual") return null;
  const cat = findCategoria(t, catId);
  if (!cat) return null;
  const ruta = findRuta(cat, rutaId);
  if (!ruta) return { capacidad: num(cat.capacidad), total: null, hint: null };
  const base = num(ruta.unitario);
  const rn = nocturno ? num(t.recargos.nocturno) : 0;
  const rd = dominical ? num(t.recargos.dominicalFestivo) : 0;
  const total = base + rn + rd;
  let hint = `Tarifa base: ${fmtCOP(base)}`;
  if (rn) hint += " + recargo nocturno";
  if (rd) hint += " + recargo dominical/festivo";
  hint += ` = ${fmtCOP(total)}`;
  return { capacidad: num(cat.capacidad), total, hint };
}

/** Holgura (COP) para reconocer un recargo dentro del valor aunque la tarifa de la ruta haya cambiado. */
const HOLGURA_RECARGO = 8000;

/**
 * Recargos realmente cobrados en un servicio con tarifa. Se deducen del valor
 * guardado (valor − unitario de la ruta ≈ 0 / nocturno / dominical / ambos),
 * porque en datos migrados el recargo quedó sumado sin marcar la casilla. Si
 * el valor no encaja en ninguna combinación (valor editado a mano), mandan las
 * casillas del servicio.
 */
export function recargosCobrados(s: Servicio, t: Tarifario): { nocturno: boolean; dominical: boolean } {
  const porCasillas = { nocturno: !!s.recargoNocturno, dominical: !!s.recargoDominical };
  const ruta = findRuta(findCategoria(t, s.tarifaCategoria), s.tarifaRuta);
  if (!ruta) return porCasillas;
  const extra = num(s.value) - num(ruta.unitario);
  const rn = num(t.recargos.nocturno);
  const rd = num(t.recargos.dominicalFestivo);
  const combos = [
    { nocturno: false, dominical: false, v: 0 },
    { nocturno: true, dominical: false, v: rn },
    { nocturno: false, dominical: true, v: rd },
    { nocturno: true, dominical: true, v: rn + rd },
  ];
  const hit = combos.find((c) => Math.abs(extra - c.v) <= HOLGURA_RECARGO);
  return hit ? { nocturno: hit.nocturno, dominical: hit.dominical } : porCasillas;
}

/**
 * Recalcula el valor de todos los servicios que usan el tarifario (los de
 * tarifa manual o sin ruta no se tocan), conservando los recargos cobrados y
 * dejando sus casillas coherentes con el valor. Devuelve solo los meses que
 * cambian, cuántos servicios cambian (y cuántos ya estaban facturados o
 * prefacturados) y la diferencia total en COP.
 */
export function recalcularValores(
  servicesByMonth: Record<string, Servicio[]>,
  t: Tarifario,
): { cambios: Record<string, Servicio[]>; servicios: number; facturados: number; diferencia: number } {
  const cambios: Record<string, Servicio[]> = {};
  let servicios = 0;
  let facturados = 0;
  let diferencia = 0;
  for (const [mk, arr] of Object.entries(servicesByMonth)) {
    let cambio = false;
    const next = (arr ?? []).map((s) => {
      const rec = recargosCobrados(s, t);
      const c = computeValor(t, s.tarifaCategoria, s.tarifaRuta, rec.nocturno, rec.dominical);
      if (!c || c.total == null) return s;
      const mismoValor = c.total === num(s.value);
      if (mismoValor && rec.nocturno === !!s.recargoNocturno && rec.dominical === !!s.recargoDominical) return s;
      cambio = true;
      if (!mismoValor) {
        servicios += 1;
        if (s.invoiced || s.prefactura) facturados += 1;
        diferencia += c.total - num(s.value);
      }
      return { ...s, value: String(c.total), recargoNocturno: rec.nocturno, recargoDominical: rec.dominical };
    });
    if (cambio) cambios[mk] = next;
  }
  return { cambios, servicios, facturados, diferencia };
}

/**
 * Desglose del valor para los reportes: valor de la ruta + recargo nocturno
 * (horas extra) + recargo dominical/festivo = valor total. Sin tarifario
 * (p. ej. Contrato de Alquiler) o con tarifa manual, todo el valor queda como
 * valor del servicio.
 */
export function desgloseValor(
  s: Servicio,
  t: Tarifario | null | undefined,
): { base: number; nocturno: number; dominical: number; total: number } {
  const total = num(s.value);
  if (!t || !s.tarifaCategoria || !s.tarifaRuta) return { base: total, nocturno: 0, dominical: 0, total };
  const rec = recargosCobrados(s, t);
  const nocturno = rec.nocturno ? num(t.recargos.nocturno) : 0;
  const dominical = rec.dominical ? num(t.recargos.dominicalFestivo) : 0;
  if (nocturno + dominical > total) return { base: total, nocturno: 0, dominical: 0, total };
  return { base: total - nocturno - dominical, nocturno, dominical, total };
}

/** Descripción de la tarifa para la orden PDF: '<cat.label> — <ruta.label>' o manual. */
export function tarifaDescriptionFor(t: Tarifario | null, s: Servicio): string {
  const cat = t ? findCategoria(t, s.tarifaCategoria) : null;
  const ruta = findRuta(cat, s.tarifaRuta);
  if (cat && ruta) return `${cat.label} — ${ruta.label}`;
  return "No aplica (tarifa manual)";
}

// ── Vencimientos ───────────────────────────────────────────────────

/** Días hasta la fecha ('AAAA-MM-DD') contra hoy 00:00; negativo = vencido. */
export function diasParaVencer(fecha: string, today = new Date()): number {
  const hoy0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((new Date(fecha + "T00:00:00").getTime() - hoy0) / 86400000);
}

/** Clase de semáforo del proyecto: rojo vencido / ámbar ≤30 días / verde. */
export function vencCls(dias: number): "high" | "warn" | "ok" {
  return dias < 0 ? "high" : dias <= 30 ? "warn" : "ok";
}

// ── Alertas contractuales (§4.9) ───────────────────────────────────

/**
 * Recorre todos los servicios + catálogos y arma las alertas de cumplimiento.
 * Orden del original: emergencias/soportes/sobrepeso en orden de recorrido;
 * vencimientos ya vencidos y el 90% del contrato se insertan al inicio.
 * La vista muestra máximo 8 (ALERTAS_MAX).
 */
export const ALERTAS_MAX = 8;

export function computeAlertas(
  servicesByMonth: Record<string, Servicio[]>,
  admin: AdminConfig | null,
  today = new Date(),
): Alerta[] {
  const alertas: Alerta[] = [];
  let totalValue = 0;

  for (const key of Object.keys(servicesByMonth).sort()) {
    for (const s of servicesByMonth[key]) {
      totalValue += num(s.value);
      const placa = s.plate || "sin placa";
      // 1. Emergencia > 3 h
      const rh = respHours(s.hourReq, s.hourAtt);
      if (s.serviceType === "Emergencia" && rh !== null && rh > 3) {
        alertas.push({
          nivel: "high",
          titulo: `Emergencia atendida en ${rh} h`,
          detalle: `${fdate(s.date)} · ${placa} — supera el límite de 3 h (numeral 14)`,
        });
      }
      // 2. Soporte incompleto
      if (!s.photo || !s.approved) {
        const faltas: string[] = [];
        if (!s.photo) faltas.push("evidencia fotográfica");
        if (!s.approved) faltas.push("V°B° del interventor");
        alertas.push({
          nivel: "warn",
          titulo: "Soporte incompleto",
          detalle: `${fdate(s.date)} · falta ${faltas.join(" y ")} (numeral 25)`,
        });
      }
      // 3. Sobrepeso
      if (num(s.weight) > num(s.capacity) && num(s.capacity) > 0) {
        alertas.push({
          nivel: "high",
          titulo: "Peso excede capacidad del vehículo",
          detalle: `${fdate(s.date)} · equipo ${num(s.weight)} Ton en vehículo de ${num(s.capacity)} Ton`,
        });
      }
    }
  }

  // 4. Vencimientos de vehículos (solo activos)
  const pushVenc = (nombre: string, sujeto: string, fecha: string | null | undefined) => {
    if (!fecha) return;
    const dias = diasParaVencer(fecha, today);
    if (dias < 0) {
      alertas.unshift({ nivel: "high", titulo: `${nombre} vencido`, detalle: `${sujeto} — venció el ${fdate(fecha)}` });
    } else if (dias <= 30) {
      alertas.push({ nivel: "warn", titulo: `${nombre} por vencer`, detalle: `${sujeto} — vence en ${dias} día(s) (${fdate(fecha)})` });
    }
  };
  admin?.vehiculos.filter((v) => v.activo !== false).forEach((v) => {
    pushVenc("SOAT", `Vehículo ${v.plate}`, v.venceSoat);
    pushVenc("Revisión tecnomecánica", `Vehículo ${v.plate}`, v.venceTecno);
  });

  // 5. Licencias del personal (solo activos)
  admin?.personal.filter((p) => p.activo !== false).forEach((p) => {
    if (!p.venceLicencia) return;
    const dias = diasParaVencer(p.venceLicencia, today);
    if (dias < 0) {
      alertas.unshift({ nivel: "high", titulo: "Licencia de conducción vencida", detalle: `${p.nombre} — venció el ${fdate(p.venceLicencia)}` });
    } else if (dias <= 30) {
      alertas.push({ nivel: "warn", titulo: "Licencia por vencer", detalle: `${p.nombre} — vence en ${dias} día(s) (${fdate(p.venceLicencia)})` });
    }
  });

  // 6. 90% del valor del contrato
  if (totalValue > CONTRACT_VALUE * 0.9) {
    alertas.unshift({
      nivel: "high",
      titulo: "Valor del contrato próximo a agotarse",
      detalle: `Ejecutado ${((totalValue / CONTRACT_VALUE) * 100).toFixed(1)}% del valor total (Cláusula Segunda)`,
    });
  }

  return alertas;
}

export const ALERTAS_VACIO = "Sin alertas activas. Los registros están completos y dentro de los tiempos contractuales.";

// ── Agregados útiles ───────────────────────────────────────────────

/** Todos los servicios en pares [monthKey, item], en orden de mes. */
export function collectAllItems(servicesByMonth: Record<string, Servicio[]>): Array<[string, Servicio]> {
  return Object.keys(servicesByMonth)
    .sort()
    .flatMap((k) => servicesByMonth[k].map((s) => [k, s] as [string, Servicio]));
}

export interface Totales {
  servicios: number;
  valor: number;
  peajes: number;
  pendientes: number;       // sin facturar
  valorPendiente: number;
  sinSoporte: number;       // !photo || !approved
}

export function totales(items: Servicio[]): Totales {
  const t: Totales = { servicios: 0, valor: 0, peajes: 0, pendientes: 0, valorPendiente: 0, sinSoporte: 0 };
  for (const s of items) {
    t.servicios += 1;
    t.valor += num(s.value);
    t.peajes += num(s.tolls);
    if (!s.invoiced) { t.pendientes += 1; t.valorPendiente += num(s.value); }
    if (!s.photo || !s.approved) t.sinSoporte += 1;
  }
  return t;
}

/** Re-export cómodo para las vistas. */
export { areaAAADe };
