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
/** Cuotas por id, primera cuota (separación) de cada venta y cuáles son separaciones. */
function estructura(cuotas: CuotaSH[]) {
  const porId = new Map(cuotas.map((c) => [c.payment_id, c]));
  // Primera cuota (no crédito) de cada venta = su separación.
  const primera = new Map<string, CuotaSH>();
  for (const c of cuotas) {
    if (c.tipo === 5 || !c.fecha) continue;
    const p = primera.get(c.prospect_id);
    if (!p || c.fecha < (p.fecha as string)) primera.set(c.prospect_id, c);
  }
  const esSeparacion = new Set([...primera.values()].map((c) => c.payment_id));
  const esCuotaInicial = (c: CuotaSH | undefined): c is CuotaSH => !!c && !(c.tipo !== null && TIPOS_EXCLUIDOS.has(c.tipo));
  return { porId, primera, esSeparacion, esCuotaInicial };
}

export function calcularReferenciaLotes(
  periodo: string,
  cuotas: CuotaSH[],
  abonos: AbonoSH[],
  clientes: Map<string, ClienteSH>,
): ReferenciaLotes {
  const mes = periodo.slice(0, 7);
  const { porId, esSeparacion } = estructura(cuotas);

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

// ── Pista de la causa de una diferencia ─────────────────────────────

export type TipoPista = "venta_nueva" | "pago_no_incluido" | "otro_mes" | "sin_causa";
export interface PistaDiferencia { tipo: TipoPista; texto: string }

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const mesDesplazado = (mes: string, n: number) => {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Posible causa de una diferencia (Smarthome − informe) en el recaudo real de
 * Lotes. Solo propone patrones verificables en los datos; si no hay ninguno,
 * lo dice. `abonos` debe incluir el mes anterior y el siguiente.
 */
export function pistaDiferencia(
  periodo: string,
  diferencia: number,
  cuotas: CuotaSH[],
  abonos: AbonoSH[],
  clientes: Map<string, ClienteSH>,
): PistaDiferencia | null {
  if (Math.abs(diferencia) < 1) return null;
  const mes = periodo.slice(0, 7);
  const { porId, primera, esSeparacion, esCuotaInicial } = estructura(cuotas);
  const nombre = (pid: string) => {
    const c = clientes.get(pid);
    const n = (c?.cliente ?? "").replace(/\s+/g, " ").trim() || "un cliente";
    return c?.module ? `${n} (${c.module.toLowerCase()})` : n;
  };
  const deCuotaInicial = abonos.filter((a) => esCuotaInicial(porId.get(cuotaDeAbono(a.id))));
  const noSeparacion = (a: AbonoSH) => !esSeparacion.has(cuotaDeAbono(a.id));

  if (diferencia > 0) {
    // 1. Venta nueva que pagó una segunda cuota en su mismo mes de compra (el informe suele contarla como venta).
    const extra = deCuotaInicial.filter((a) => {
      if (a.fecha?.slice(0, 7) !== mes || !noSeparacion(a)) return false;
      const q = porId.get(cuotaDeAbono(a.id));
      return q?.fecha?.slice(0, 7) === primera.get(a.prospect_id)?.fecha?.slice(0, 7);
    });
    const sumaExtra = extra.reduce((t, a) => t + (a.monto ?? 0), 0);
    if (extra.length && Math.abs(sumaExtra - diferencia) < 1) {
      const quienes = lista([...new Set(extra.map((a) => nombre(a.prospect_id)))]);
      return {
        tipo: "venta_nueva",
        texto: `${quienes} ${extra.length === 1 ? "es una venta nueva que pagó" : "son ventas nuevas que pagaron"} ${COP.format(diferencia)} a una segunda cuota en su mismo mes de compra. El informe suele contar ese dinero como venta, no como recaudo.`,
      };
    }
    // 2. Un pago del mes por exactamente la diferencia que el informe no habría incluido.
    const igual = deCuotaInicial.find((a) => a.fecha?.slice(0, 7) === mes && noSeparacion(a) && Math.abs((a.monto ?? 0) - diferencia) < 1);
    if (igual?.fecha) {
      return { tipo: "pago_no_incluido", texto: `El informe no habría incluido el pago de ${COP.format(diferencia)} de ${nombre(igual.prospect_id)} del ${fecha(igual.fecha)}.` };
    }
  }
  // 3. Un pago por el mismo valor con fecha en el mes anterior o el siguiente.
  const vecinos = [mesDesplazado(mes, -1), mesDesplazado(mes, 1)];
  const otro = deCuotaInicial.find((a) => vecinos.includes(a.fecha?.slice(0, 7) ?? "") && noSeparacion(a) && Math.abs((a.monto ?? 0) - Math.abs(diferencia)) < 1);
  if (otro?.fecha) {
    return { tipo: "otro_mes", texto: `Smarthome tiene un pago de ${COP.format(Math.abs(diferencia))} de ${nombre(otro.prospect_id)} con fecha ${fecha(otro.fecha)}; pudo registrarse en un mes distinto al del informe.` };
  }
  return { tipo: "sin_causa", texto: "Sin causa identificada en Smarthome: puede ser un pago anulado o reprogramado, o un ajuste hecho en el informe." };
}

/** Comparación de un mes contra el informe guardado (la calcula la ruta de referencia). */
export interface ComparacionSmarthome { informeReal: number | null; diferencia: number | null; pista: PistaDiferencia | null }
