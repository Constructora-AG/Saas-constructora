import assert from "node:assert/strict";
import test from "node:test";

import { ESQUEMA_CARTERA, REGLAS_CALCULO } from "@/lib/asistente/contexto";

test("el Asistente y el Conector calculan el recaudo cuota por cuota, como la página Recaudo", () => {
  // La regla vieja comparaba caja del mes con cuotas del mes: los anticipos inflaban el avance.
  assert.ok(!/Recaudo de un mes = sum\(sh_abonos\.monto\) por fecha/.test(REGLAS_CALCULO));
  assert.match(REGLAS_CALCULO, /left\(sh_abonos\.id, 36\)/);
  assert.match(REGLAS_CALCULO, /Nunca calcules cumplimiento o avance como caja ÷ programado/);
  assert.match(ESQUEMA_CARTERA, /5 = crédito/);
  // Las consultas tipo deben poder ejecutarse con asistente_consulta: sin punto y coma.
  const consultas = REGLAS_CALCULO.split("\n").filter((l) => /^\s*(with|select)\s/.test(l));
  assert.equal(consultas.length, 3);
  for (const q of consultas) assert.ok(!q.includes(";"), q);
});

test("el Asistente separa del pendiente las unidades con dos ventas activas", () => {
  assert.match(REGLAS_CALCULO, /Unidades con dos ventas activas/);
  assert.match(REGLAS_CALCULO, /No la recomiendes como cobro prioritario/);
  // La expresión regular debe llegar a SQL como '\\s+' (un solo backslash en la consulta).
  assert.ok(REGLAS_CALCULO.includes("regexp_replace(btrim(module), '\\s+', ' ', 'g')"));
});
