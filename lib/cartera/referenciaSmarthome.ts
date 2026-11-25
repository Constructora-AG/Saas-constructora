// ════════════════════════════════════════════════════════════════════
// Referencia Smarthome para la REVISIÓN de informes mensuales de cartera.
// Solo lectura y solo lo validado contra los informes de 2026:
//
//   · Proyecto: únicamente Lotes Reserva del Manantial. Aqua no se compara
//     (la sincronización no conserva los pagos de ventas desistidas) y
//     Cascada Real no está en Smarthome.
//   · Separaciones del mes = pagos a la PRIMERA cuota del plan de cada venta
//     (ventas nuevas del mes; no forman parte del recaudo que informa cartera).
//   · Recaudo real = pagos de cuota inicial del mes − separaciones.
//     Coincide exactamente con el informe en 8 de 10 meses (ene–oct 2026) y en
//     octubre identifica los mismos 3 clientes del PDF.
//   · El programado NO se compara: el informe lo ajusta por pagos anticipados.
// ════════════════════════════════════════════════════════════════════

/** Tipos de cuota que no son cuota inicial: 5 = crédito; 2 y 3 sin confirmar. */
const TIPOS_EXCLUIDOS = new Set([2, 3, 5]);

/** El id de un abono es `<payment_id de la cuota>-<id del pago>`. */
export const cuotaDeAbono = (abonoId: string) => abonoId.slice(0, 36);

export interface CuotaSH { payment_id: string; prospect_id: string; fecha: string | null; tipo: number | null }
export interface AbonoSH { id: string; prospect_id: string; fecha: string | null; monto: number | null }
export interface ClienteSH { cliente: string | null; module: string | null }

export interface SeparacionSH { prospect_id: string; cliente: string; unidad: string; valor: number }

export interface ReferenciaLotes {
  /** Pagos de cuota inicial recibidos en el mes (incluye separaciones). */
  recaudoTotal: number;
  separacionesTotal: number;
  /** Recaudo real comparable con el informe: total − separaciones. */
  recaudoReal: number;
  /** Desglose del recaudo real según la cuota que paga cada abono. */
  delMes: number;
  anticipado: number;
  moraRecuperada: number;
  separaciones: SeparacionSH[];
}

/**
 * `cuotas`: todas las cuotas de Lotes (para saber cuál es la primera de cada venta).
 * `abonos`: abonos de Lotes (se filtran al mes de `periodo`, YYYY-MM-01).
 */
export function calcularReferenciaLotes(
  periodo: string,
  cuotas: CuotaSH[],
  abonos: AbonoSH[],
  clientes: Map<string, ClienteSH>,
): ReferenciaLotes {
  const mes = periodo.slice(0, 7);
  const porId = new Map(cuotas.map((c) => [c.payment_id, c]));
  // Primera cuota (no crédito) de cada venta = su separación.
  const primera = new Map<string, CuotaSH>();
  for (const c of cuotas) {
    if (c.tipo === 5 || !c.fecha) continue;
    const p = primera.get(c.prospect_id);
    if (!p || c.fecha < (p.fecha as string)) primera.set(c.prospect_id, c);
  }
  const esSeparacion = new Set([...primera.values()].map((c) => c.payment_id));

  const r: ReferenciaLotes = { recaudoTotal: 0, separacionesTotal: 0, recaudoReal: 0, delMes: 0, anticipado: 0, moraRecuperada: 0, separaciones: [] };
  const sep = new Map<string, number>();
  for (const a of abonos) {
    if (a.fecha?.slice(0, 7) !== mes) continue;
    const cuota = porId.get(cuotaDeAbono(a.id));
    if (!cuota || (cuota.tipo !== null && TIPOS_EXCLUIDOS.has(cuota.tipo))) continue;
    const monto = a.monto ?? 0;
    r.recaudoTotal += monto;
    if (esSeparacion.has(cuota.payment_id)) {
      r.separacionesTotal += monto;
      sep.set(a.prospect_id, (sep.get(a.prospect_id) ?? 0) + monto);
      continue;
    }
    const mesCuota = cuota.fecha?.slice(0, 7) ?? mes;
    if (mesCuota === mes) r.delMes += monto;
    else if (mesCuota > mes) r.anticipado += monto;
    else r.moraRecuperada += monto;
  }
  r.recaudoReal = r.recaudoTotal - r.separacionesTotal;
  r.separaciones = [...sep].map(([pid, valor]) => ({
    prospect_id: pid,
    cliente: (clientes.get(pid)?.cliente ?? "").replace(/\s+/g, " ").trim() || "Cliente sin nombre",
    unidad: clientes.get(pid)?.module ?? "",
    valor,
  })).sort((a, b) => b.valor - a.valor);
  return r;
}

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

/** ¿El cliente de Smarthome está entre las separaciones del informe? (coinciden al menos 2 palabras del nombre). */
export function separacionEnInforme(cliente: string, nombresInforme: string[]): boolean {
  const a = new Set(normal(cliente));
  return nombresInforme.some((n) => normal(n).filter((p) => a.has(p)).length >= 2);
}
