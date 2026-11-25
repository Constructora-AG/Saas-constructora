import assert from "node:assert/strict";
import test from "node:test";

import { calcularReferenciaLotes, pistaDiferencia, separacionEnInforme, type AbonoSH, type CuotaSH } from "@/lib/cartera/referenciaSmarthome";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
// Venta A (separó en agosto) y venta B (nueva en octubre: su primera cuota es la separación).
const cuotas: CuotaSH[] = [
  { payment_id: uuid(9), prospect_id: "A", fecha: "2026-08-01", tipo: 0 }, // separación de A (agosto)
  { payment_id: uuid(1), prospect_id: "A", fecha: "2026-09-05", tipo: 0 },
  { payment_id: uuid(2), prospect_id: "A", fecha: "2026-10-05", tipo: 0 },
  { payment_id: uuid(3), prospect_id: "A", fecha: "2026-11-05", tipo: 0 },
  { payment_id: uuid(4), prospect_id: "A", fecha: "2027-06-05", tipo: 5 },
  { payment_id: uuid(5), prospect_id: "B", fecha: "2026-10-20", tipo: 0 },
  { payment_id: uuid(6), prospect_id: "B", fecha: "2026-11-20", tipo: 0 },
];
const abono = (cuota: number, pid: string, fecha: string, monto: number, n: number): AbonoSH => ({ id: `${uuid(cuota)}-${uuid(100 + n)}`, prospect_id: pid, fecha, monto });
const abonos: AbonoSH[] = [
  abono(1, "A", "2026-10-02", 300_000, 1), // cuota de septiembre pagada en octubre → mora recuperada
  abono(2, "A", "2026-10-05", 1_000_000, 2), // cuota del mes
  abono(3, "A", "2026-10-06", 1_000_000, 3), // cuota de noviembre → anticipo
  abono(4, "A", "2026-10-07", 9_000_000, 4), // crédito: no cuenta
  abono(5, "B", "2026-10-20", 2_000_000, 5), // separación (venta nueva)
  abono(6, "B", "2026-09-30", 500_000, 6), // otro mes: no cuenta
];
const clientes = new Map([["B", { cliente: "Ramiro  Porras Sarmiento", module: "MANZANA 4 LOTE 14" }]]);

test("separa las ventas nuevas del mes y desglosa el recaudo real", () => {
  const r = calcularReferenciaLotes("2026-10-01", cuotas, abonos, clientes);
  assert.equal(r.recaudoTotal, 4_300_000);
  assert.equal(r.separacionesTotal, 2_000_000);
  assert.equal(r.recaudoReal, 2_300_000);
  assert.equal(r.delMes, 1_000_000);
  assert.equal(r.anticipado, 1_000_000);
  assert.equal(r.moraRecuperada, 300_000);
  assert.deepEqual(r.separaciones, [{ prospect_id: "B", cliente: "Ramiro Porras Sarmiento", unidad: "MANZANA 4 LOTE 14", valor: 2_000_000 }]);
});

test("reconoce la separación en el informe aunque el nombre esté escrito distinto", () => {
  assert.equal(separacionEnInforme("Ramiro Porras Sarmiento", ["ramiro porras"]), true);
  assert.equal(separacionEnInforme("José Antonio Muñoz Arrazola", ["Jose Antonio Muñoz Arrazola"]), true);
  assert.equal(separacionEnInforme("Javier Barrero", ["Jose Antonio Muñoz Arrazola"]), false);
});

test("la pista explica una venta nueva que pagó una segunda cuota en su mes de compra", () => {
  // Venta C: separación 10M el 20-feb y segunda cuota de 5M el 21-feb, pagada el 24-feb.
  const cs: CuotaSH[] = [
    { payment_id: uuid(20), prospect_id: "C", fecha: "2026-02-20", tipo: 0 },
    { payment_id: uuid(21), prospect_id: "C", fecha: "2026-02-21", tipo: 0 },
    { payment_id: uuid(22), prospect_id: "C", fecha: "2026-03-31", tipo: 0 },
  ];
  const ab: AbonoSH[] = [abono(20, "C", "2026-02-20", 10_000_000, 20), abono(21, "C", "2026-02-24", 5_000_000, 21)];
  const nombres = new Map([["C", { cliente: "Monica Ospino", module: "MANZANA 4 LOTE 26" }]]);
  const p = pistaDiferencia("2026-02-01", 5_000_000, cs, ab, nombres);
  assert.equal(p?.tipo, "venta_nueva");
  assert.match(p!.texto, /Monica Ospino \(manzana 4 lote 26\) es una venta nueva/);
  assert.equal(pistaDiferencia("2026-02-01", 0, cs, ab, nombres), null); // sin diferencia, sin pista
});

test("la pista detecta un pago del mismo valor en el mes vecino, o dice que no hay causa", () => {
  const p = pistaDiferencia("2026-10-01", -1_000_000, cuotas, abonos, new Map());
  assert.equal(p?.tipo, "sin_causa"); // ningún pago de $1.000.000 en sep/nov
  const otro = pistaDiferencia("2026-09-01", -1_000_000, cuotas, abonos, new Map());
  assert.equal(otro?.tipo, "otro_mes"); // el pago de $1.000.000 de A está en octubre
  const incluido = pistaDiferencia("2026-10-01", 1_000_000, cuotas, abonos, new Map());
  assert.equal(incluido?.tipo, "pago_no_incluido"); // pago de $1.000.000 de A en octubre
});
