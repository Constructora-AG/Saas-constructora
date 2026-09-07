// Fecha estimada de pago de una prefactura: Triple A paga por lo general
// 45 días HÁBILES después de la fecha de la factura (lunes a viernes,
// sin festivos colombianos; se reutiliza el calendario de Transporte AAA).
import { FESTIVOS_DEFAULT } from "@/lib/transporte/constants";

export const DIAS_HABILES_PAGO = 45;

const FESTIVOS = new Set(FESTIVOS_DEFAULT.map((f) => f.date));

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const esHabil = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !FESTIVOS.has(iso(d));

/** Suma `n` días hábiles a una fecha ISO (AAAA-MM-DD). Devuelve ISO o null si la fecha no es válida. */
export function sumarDiasHabiles(fechaIso: string | null | undefined, n = DIAS_HABILES_PAGO): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaIso ?? ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  let restantes = n;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (esHabil(d)) restantes--;
  }
  return iso(d);
}

/** Días calendario entre hoy y la fecha (negativo = ya pasó). */
export function diasHasta(fechaIso: string | null | undefined, hoy = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaIso ?? ""));
  if (!m) return null;
  const f = new Date(+m[1], +m[2] - 1, +m[3]);
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((f.getTime() - h.getTime()) / 86400000);
}
