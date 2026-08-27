import type { PaymentSummaryItem } from "@/lib/smarthome/types";

export type Semaforo = "al_dia" | "d1_30" | "d31_60" | "d61_90" | "d90_mas";

export interface CarteraCalc {
  totalProgramado: number;
  totalPagado: number;
  saldo: number;
  saldoInicial: number; // falta de cuota inicial (separación + cuotas)
  saldoCredito: number; // falta del crédito
  cuotasVencidas: number;
  cuotasPagadas: number;   // cuotas cubiertas (pagadas al 100%)
  cuotasPorVencer: number; // cuotas futuras aún no pagadas
  cuotasTotal: number;
  montoEnMora: number;
  moraInicial: number; // vencido de cuota inicial (separación + cuotas)
  moraCredito: number; // vencido del crédito
  diasMora: number;
  semaforo: Semaforo;
  proximaCuotaFecha: string | null;
  proximaCuotaValor: number | null;
}

function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function semaforoFromDias(dias: number): Semaforo {
  if (dias <= 0) return "al_dia";
  if (dias <= 30) return "d1_30";
  if (dias <= 60) return "d31_60";
  if (dias <= 90) return "d61_90";
  return "d90_mas";
}

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  al_dia: "Al día",
  d1_30: "1-30 días",
  d31_60: "31-60 días",
  d61_90: "61-90 días",
  d90_mas: "+90 días",
};

export const SEMAFORO_COLOR: Record<Semaforo, string> = {
  al_dia: "#2f9e5b",
  d1_30: "#c9a227",
  d31_60: "#d98324",
  d61_90: "#cf5b2c",
  d90_mas: "#c0392b",
};

/**
 * Calcula la cartera de una venta a partir del plan de pagos de Smarthome.
 * Una cuota está vencida si su fecha programada ya pasó y lo abonado es menor a lo esperado.
 * Los días de mora se cuentan desde la cuota vencida más antigua sin saldar.
 */
export function computeCartera(
  items: PaymentSummaryItem[],
  today: Date = new Date(),
): CarteraCalc {
  let totalProgramado = 0;
  let totalPagado = 0;
  let cuotasVencidas = 0;
  let montoEnMora = 0;
  let moraInicial = 0, moraCredito = 0;
  let oldestOverdue: Date | null = null;
  // Separado por concepto: crédito (paymentType 5) vs cuota inicial (separación 0 + cuotas 1).
  let progCredito = 0, pagCredito = 0, progInicial = 0, pagInicial = 0;
  let cuotasPagadas = 0, cuotasPorVencer = 0;

  const futuras: { fecha: Date; valor: number }[] = [];

  for (const it of items) {
    const esperado = it.scheduledPaymentAmountValue ?? 0;
    const pagado = (it.payments ?? []).reduce((s, p) => s + (p.amountValue ?? 0), 0);
    totalProgramado += esperado;
    totalPagado += pagado;
    if (it.paymentType === 5) { progCredito += esperado; pagCredito += pagado; }
    else { progInicial += esperado; pagInicial += pagado; }

    const fecha = new Date(it.date);
    const pendiente = Math.max(0, esperado - pagado);

    if (pendiente <= 0.005) {
      cuotasPagadas += 1; // cubierta al 100%
    } else if (fecha <= today) {
      cuotasVencidas += 1;
      montoEnMora += pendiente;
      if (it.paymentType === 5) moraCredito += pendiente;
      else moraInicial += pendiente;
      if (!oldestOverdue || fecha < oldestOverdue) oldestOverdue = fecha;
    } else {
      cuotasPorVencer += 1;
      futuras.push({ fecha, valor: pendiente });
    }
  }

  const saldo = Math.max(0, totalProgramado - totalPagado);
  const diasMora = oldestOverdue ? Math.max(0, dayDiff(oldestOverdue, today)) : 0;
  const semaforo = semaforoFromDias(diasMora);

  futuras.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const prox = futuras[0];

  return {
    totalProgramado,
    totalPagado,
    saldo,
    saldoInicial: Math.max(0, progInicial - pagInicial),
    saldoCredito: Math.max(0, progCredito - pagCredito),
    cuotasVencidas,
    cuotasPagadas,
    cuotasPorVencer,
    cuotasTotal: items.length,
    montoEnMora,
    moraInicial,
    moraCredito,
    diasMora,
    semaforo,
    proximaCuotaFecha: prox ? prox.fecha.toISOString().slice(0, 10) : null,
    proximaCuotaValor: prox ? prox.valor : null,
  };
}
