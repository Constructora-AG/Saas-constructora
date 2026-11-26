import assert from "node:assert/strict";
import test from "node:test";

import { conceptoDe, recaudoPorCliente, tendenciaMensual, type AbonoRec, type CuotaRec } from "@/lib/recaudo/clientes";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const cuota = (n: number, pid: string, fecha: string, programado: number, tipo = 0): CuotaRec => ({ payment_id: uuid(n), prospect_id: pid, project_name: "Lotes", fecha, tipo, programado });
const abono = (n: number, pid: string, fecha: string, monto: number, k: number): AbonoRec => ({ id: `${uuid(n)}-${uuid(500 + k)}`, prospect_id: pid, fecha, monto });
const OCT = { desde: "2026-10-01", hasta: "2026-10-31", concepto: "inicial" as const };

test("un cliente que pagó por adelantado ya no aparece con deuda", () => {
  // A pagó en septiembre la cuota de octubre. Antes figuraba con «Pendiente» en octubre.
  const filas = recaudoPorCliente(OCT, [cuota(1, "A", "2026-10-15", 1_000_000)], [abono(1, "A", "2026-09-20", 1_000_000, 1)], new Map());
  assert.equal(filas[0].pendiente, 0);
  assert.equal(filas[0].estado, "adelantado");
  assert.equal(filas[0].pagosPeriodo, 0);
});

test("un pago a una cuota futura no tapa la cuota del mes sin pagar", () => {
  // B no pagó la cuota de octubre, pero en octubre pagó la de noviembre.
  const filas = recaudoPorCliente(OCT,
    [cuota(2, "B", "2026-10-15", 1_000_000), cuota(3, "B", "2026-11-15", 1_000_000)],
    [abono(3, "B", "2026-10-10", 1_000_000, 2)], new Map());
  assert.equal(filas[0].pendiente, 1_000_000);
  assert.equal(filas[0].estado, "pendiente");
  assert.equal(filas[0].anticipos, 1_000_000);
  assert.equal(filas[0].delPeriodo, 0);
});

test("desglosa los pagos del período y cuenta pagos posteriores (corte a hoy)", () => {
  const filas = recaudoPorCliente(OCT,
    [cuota(4, "C", "2026-09-15", 500_000), cuota(5, "C", "2026-10-15", 1_000_000)],
    [abono(4, "C", "2026-10-05", 500_000, 3), abono(5, "C", "2026-11-03", 1_000_000, 4)], new Map());
  const c = filas[0];
  assert.equal(c.pendiente, 0); // la de octubre se pagó en noviembre: a hoy no debe
  assert.equal(c.estado, "al_dia");
  assert.equal(c.mora, 500_000); // pagó en octubre la cuota vencida de septiembre
  assert.equal(c.ultimoPago, "2026-11-03");
});

test("el crédito va aparte de la cuota inicial", () => {
  const cs = [cuota(6, "D", "2026-10-20", 1_000_000), cuota(7, "D", "2026-10-20", 90_000_000, 5)];
  assert.equal(recaudoPorCliente(OCT, cs, [], new Map())[0].debe, 1_000_000);
  assert.equal(recaudoPorCliente({ ...OCT, concepto: "credito" }, cs, [], new Map())[0].debe, 90_000_000);
  assert.equal(recaudoPorCliente({ ...OCT, concepto: "todo" }, cs, [], new Map())[0].debe, 91_000_000);
  assert.deepEqual([0, 1, 2, 3, 5, null].map(conceptoDe), ["inicial", "inicial", "otros", "otros", "credito", "inicial"]);
});

test("la tendencia mensual usa la misma regla: un anticipo cuenta en el mes de su cuota", () => {
  // A pagó en septiembre la cuota de octubre; B paga en octubre la de octubre.
  const cs = [cuota(10, "A", "2026-10-10", 1_000_000), cuota(11, "B", "2026-10-12", 2_000_000), cuota(12, "B", "2026-09-12", 500_000)];
  const ab = [abono(10, "A", "2026-09-25", 1_000_000, 10), abono(11, "B", "2026-10-12", 2_000_000, 11)];
  const t = tendenciaMensual("2026-10", 2, "inicial", cs, ab);
  const sep = t.find((m) => m.mes === "2026-09")!, oct = t.find((m) => m.mes === "2026-10")!;
  assert.deepEqual([sep.debe, sep.yaPagado, sep.pagos, sep.anticipos], [500_000, 0, 1_000_000, 1_000_000]);
  assert.deepEqual([oct.debe, oct.yaPagado, oct.pagos, oct.anticipos], [3_000_000, 3_000_000, 2_000_000, 0]);
});
