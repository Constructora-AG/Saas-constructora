// Recaudo por cliente de la página /recaudo, calculado cuota por cuota: cada pago
// se aplica a la cuota que paga (el id del abono la identifica). Así un pago
// adelantado no deja deuda en el mes en que vence su cuota, y un pago a una cuota
// futura no cubre una cuota del período que sigue sin pagar.
//   · Debe pagar    = cuotas que vencen en el período.
//   · Ya pagado     = lo pagado a esas cuotas, con cualquier fecha (corte: hoy).
//   · Pendiente hoy = lo que aún falta de esas cuotas; es la cifra para cobrar.
// El crédito (tipo 5) va aparte de la cuota inicial: sus desembolsos son del banco.

import { cuotaDeAbono } from "@/lib/cartera/referenciaSmarthome";

export type Concepto = "inicial" | "credito" | "otros" | "todo";

export const CONCEPTOS: { id: Concepto; label: string }[] = [
  { id: "inicial", label: "Cuota inicial" },
  { id: "credito", label: "Crédito" },
  { id: "otros", label: "Otros (tipos sin confirmar)" },
  { id: "todo", label: "Todo" },
];

/** Tipo de cuota de Smarthome → concepto (5 = crédito; 2 y 3 sin confirmar). */
export function conceptoDe(tipo: number | null): Exclude<Concepto, "todo"> {
  if (tipo === 5) return "credito";
  if (tipo === 2 || tipo === 3) return "otros";
  return "inicial";
}

export function esConcepto(v: unknown): v is Concepto {
  return CONCEPTOS.some((c) => c.id === v);
}

export interface CuotaRec { payment_id: string; prospect_id: string; project_name: string | null; fecha: string | null; tipo: number | null; programado: number | null }
export interface AbonoRec { id: string; prospect_id: string; fecha: string | null; monto: number | null }
export interface ClienteRec { cliente: string | null; module: string | null }

export type EstadoCliente = "pendiente" | "adelantado" | "al_dia" | "sin_cuotas";

export interface FilaCliente {
  prospectId: string;
  cliente: string;
  unidad: string;
  proyecto: string;
  /** Cuotas que vencen en el período. */
  debe: number;
  /** Lo pagado a esas cuotas, con cualquier fecha (a hoy). */
  yaPagado: number;
  /** Lo que aún falta de esas cuotas. */
  pendiente: number;
  /** Parte de «ya pagado» que se pagó antes de empezar el período. */
  pagadoAntes: number;
  /** Pagos recibidos en el período y su desglose. */
  pagosPeriodo: number;
  delPeriodo: number;
  anticipos: number;
  mora: number;
  abonosPeriodo: number;
  /** Último pago registrado del cliente (de este concepto), a hoy. */
  ultimoPago: string | null;
  estado: EstadoCliente;
}

export interface Periodo { desde: string | null; hasta: string; concepto: Concepto }

const dentro = (f: string | null, p: Periodo) => !!f && (!p.desde || f >= p.desde) && f <= p.hasta;

/** Recaudo por cliente del período. Incluye a quien debía cuotas o pagó algo en el período. */
export function recaudoPorCliente(p: Periodo, cuotas: CuotaRec[], abonos: AbonoRec[], clientes: Map<string, ClienteRec>): FilaCliente[] {
  const aplica = (c: CuotaRec | undefined): c is CuotaRec => !!c && (p.concepto === "todo" || conceptoDe(c.tipo) === p.concepto);
  const porId = new Map(cuotas.map((c) => [c.payment_id, c]));
  const pagosDe = new Map<string, AbonoRec[]>();
  for (const a of abonos) {
    const k = cuotaDeAbono(a.id);
    pagosDe.set(k, [...(pagosDe.get(k) ?? []), a]);
  }

  const filas = new Map<string, FilaCliente>();
  const fila = (pid: string, proyecto: string | null) => {
    let f = filas.get(pid);
    if (!f) {
      const c = clientes.get(pid);
      f = {
        prospectId: pid,
        cliente: (c?.cliente ?? "").replace(/\s+/g, " ").trim() || pid.slice(0, 8),
        unidad: (c?.module ?? "").toLowerCase(),
        proyecto: proyecto ?? "",
        debe: 0, yaPagado: 0, pendiente: 0, pagadoAntes: 0,
        pagosPeriodo: 0, delPeriodo: 0, anticipos: 0, mora: 0, abonosPeriodo: 0,
        ultimoPago: null, estado: "sin_cuotas",
      };
      filas.set(pid, f);
    }
    return f;
  };

  // 1. Cuotas que vencen en el período: cuánto se ha pagado de ellas (a hoy) y cuánto falta.
  for (const c of cuotas) {
    if (!aplica(c) || !dentro(c.fecha, p)) continue;
    const prog = c.programado ?? 0;
    const pagos = pagosDe.get(c.payment_id) ?? [];
    const pagado = Math.min(prog, pagos.reduce((t, a) => t + (a.monto ?? 0), 0));
    const antes = p.desde ? Math.min(prog, pagos.filter((a) => a.fecha && a.fecha < (p.desde as string)).reduce((t, a) => t + (a.monto ?? 0), 0)) : 0;
    const f = fila(c.prospect_id, c.project_name);
    f.debe += prog;
    f.yaPagado += pagado;
    f.pendiente += prog - pagado;
    f.pagadoAntes += antes;
  }

  // 2. Pagos recibidos en el período, según la cuota que pagan.
  for (const a of abonos) {
    const c = porId.get(cuotaDeAbono(a.id));
    if (!aplica(c) || !dentro(a.fecha, p)) continue;
    const monto = a.monto ?? 0;
    const f = fila(a.prospect_id, c.project_name);
    f.pagosPeriodo += monto;
    f.abonosPeriodo += 1;
    if (dentro(c.fecha, p)) f.delPeriodo += monto;
    else if (c.fecha && c.fecha > p.hasta) f.anticipos += monto;
    else f.mora += monto;
  }

  // 3. Último pago registrado de cada cliente (de este concepto), a hoy.
  for (const a of abonos) {
    const f = filas.get(a.prospect_id);
    if (!f || !a.fecha || !aplica(porId.get(cuotaDeAbono(a.id)))) continue;
    if (!f.ultimoPago || a.fecha > f.ultimoPago) f.ultimoPago = a.fecha;
  }

  for (const f of filas.values()) {
    f.pendiente = Math.max(0, f.pendiente);
    f.estado = f.debe <= 0 ? "sin_cuotas"
      : f.pendiente > 0.5 ? "pendiente"
      : f.pagadoAntes >= f.debe - 0.5 ? "adelantado"
      : "al_dia";
  }
  return [...filas.values()].sort((a, b) => b.pendiente - a.pendiente || b.debe - a.debe || b.pagosPeriodo - a.pagosPeriodo);
}

export interface MesRecaudo {
  mes: string; // YYYY-MM
  proyecto: string;
  /** Cuotas que vencían en el mes. */
  debe: number;
  /** Lo pagado de esas cuotas, a hoy. */
  yaPagado: number;
  /** Dinero recibido en el mes y, de él, anticipos de cuotas futuras. */
  pagos: number;
  anticipos: number;
}

const ultimoDia = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
const mesDesplazado = (mes: string, n: number) =>
  new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/** Los `n` meses que terminan en `hastaMes` (YYYY-MM), por proyecto, con la misma regla de la tabla por cliente. */
export function tendenciaMensual(hastaMes: string, n: number, concepto: Concepto, cuotas: CuotaRec[], abonos: AbonoRec[]): MesRecaudo[] {
  const out: MesRecaudo[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const mes = mesDesplazado(hastaMes, -k);
    const porProyecto = new Map<string, MesRecaudo>();
    for (const f of recaudoPorCliente({ desde: `${mes}-01`, hasta: ultimoDia(mes), concepto }, cuotas, abonos, new Map())) {
      const m = porProyecto.get(f.proyecto) ?? { mes, proyecto: f.proyecto, debe: 0, yaPagado: 0, pagos: 0, anticipos: 0 };
      m.debe += f.debe;
      m.yaPagado += f.yaPagado;
      m.pagos += f.pagosPeriodo;
      m.anticipos += f.anticipos;
      porProyecto.set(f.proyecto, m);
    }
    out.push(...porProyecto.values());
  }
  return out;
}
