import assert from "node:assert/strict";
import test from "node:test";

import {
  aplicarTransicionPrefactura,
  contratoValido,
  ESTADOS_PREFACTURA,
  limpiarAdjunto,
  mas30Dias,
  periodoTexto,
  validarItems,
} from "@/lib/aaa/prefacturas";

const adjunto = { name: "soporte.pdf", type: "application/pdf", dataUrl: "data:application/pdf;base64,AA==" };

test("contratoValido acepta contratos base y contratos dinámicos seguros", () => {
  assert.equal(contratoValido("alquiler"), true);
  assert.equal(contratoValido("emergencia"), true);
  assert.equal(contratoValido("transporte"), true);
  assert.equal(contratoValido("contrato-2026"), true);
  assert.equal(contratoValido("Contrato 2026"), false);
  assert.equal(contratoValido("../externo"), false);
  assert.equal(contratoValido(""), false);
});

test("los estados permitidos mantienen la máquina financiera actual", () => {
  assert.deepEqual([...ESTADOS_PREFACTURA], [
    "pendiente_acta_migo", "por_facturar", "pendiente_pago", "pagada", "rechazada",
  ]);
});

test("limpiarAdjunto acepta data URLs y conserva valores por defecto", () => {
  assert.deepEqual(limpiarAdjunto({ dataUrl: "data:image/png;base64,AA==" }), {
    name: "archivo",
    type: "application/octet-stream",
    dataUrl: "data:image/png;base64,AA==",
  });
  assert.equal(limpiarAdjunto(undefined), undefined);
  assert.equal(limpiarAdjunto(null), null);
});

test("limpiarAdjunto rechaza formatos inválidos y archivos demasiado grandes", () => {
  assert.throws(() => limpiarAdjunto({ dataUrl: "https://example.com/file.pdf" }), /Adjunto inválido/);
  assert.throws(() => limpiarAdjunto({ dataUrl: "data:application/pdf;base64," + "A".repeat(6 * 1024 * 1024 + 1) }), /tamaño máximo/);
});

test("mas30Dias calcula vencimiento calendario y rechaza formato inválido", () => {
  assert.equal(mas30Dias("2026-01-15"), "2026-02-14");
  assert.equal(mas30Dias("2026-12-15"), "2027-01-14");
  assert.equal(mas30Dias("15-01-2026"), null);
});

test("periodoTexto genera los formatos usados por la prefactura", () => {
  assert.equal(periodoTexto("2026-07-01", "2026-07-01", null), "01 jul 2026");
  assert.equal(periodoTexto("2026-07-01", "2026-07-31", null), "01 jul 2026 al 31 jul 2026");
  assert.equal(periodoTexto("2026-07-01", null, null), "desde 01 jul 2026");
  assert.equal(periodoTexto(null, null, "Julio 2026"), "Julio 2026");
  assert.equal(periodoTexto(null, null, ""), null);
});

test("validarItems exige al menos un ítem y catálogo para alquiler", () => {
  assert.deepEqual(validarItems("alquiler", []), { error: "La prefactura necesita al menos un ítem" });
  assert.match(String((validarItems("alquiler", [{ item: "No existe", cantidad: 1, vr_unit: 10 }] ) as { error: string }).error), /no está en el catálogo/);
  const resultado = validarItems("alquiler", [{ item: "Alq excavadora sobre oruga 22 m", cantidad: 2, vr_unit: 344500 }]);
  assert.deepEqual(resultado, {
    items: [{ item: "Alq excavadora sobre oruga 22 m", maquina: "Excavadora 22M", unidad: "HR", cantidad: 2, vr_unit: 344500, valor_base: 689000 }],
    valorBase: 689000,
  });
});

test("validarItems permite ítems libres para Transporte y contratos de la app", () => {
  const resultado = validarItems("transporte", [{ item: "Servicio especial", cantidad: 1.5, vr_unit: 100, maquina: "", unidad: "" }]);
  assert.deepEqual(resultado, {
    items: [{ item: "Servicio especial", maquina: "", unidad: "VJ", cantidad: 1.5, vr_unit: 100, valor_base: 150 }],
    valorBase: 150,
  });
  assert.deepEqual(validarItems("contrato-nuevo", [{ item: "Servicio", cantidad: 1, vr_unit: 0 }]), {
    items: [{ item: "Servicio", maquina: "", unidad: "VJ", cantidad: 1, vr_unit: 0, valor_base: 0 }],
    valorBase: 0,
  });
});

test("validarItems rechaza cantidades y tarifas inválidas", () => {
  assert.match(String((validarItems("transporte", [{ item: "x", cantidad: 0, vr_unit: 10 }] ) as { error: string }).error), /Cantidad inválida/);
  assert.match(String((validarItems("transporte", [{ item: "x", cantidad: 1, vr_unit: -1 }] ) as { error: string }).error), /Valor inválido/);
  assert.match(String((validarItems("alquiler", [{ item: "Alq excavadora sobre oruga 22 m", cantidad: 1, vr_unit: 0 }] ) as { error: string }).error), /Tarifa inválida/);
});

test("acta y MIGO llevan una prefactura a por_facturar", () => {
  const result = aplicarTransicionPrefactura({
    actualEstado: "pendiente_acta_migo",
    actualActa: null,
    actualMigo: null,
    actualFactura: null,
    actualFechaFactura: null,
    patch: { acta: adjunto, migo: adjunto },
  });
  assert.equal(result.estadoFinal, "por_facturar");
  assert.equal(result.patch.estado, "por_facturar");
});

test("adjuntar factura lleva una prefactura a pendiente_pago y fecha la factura", () => {
  const result = aplicarTransicionPrefactura({
    actualEstado: "por_facturar",
    actualActa: adjunto,
    actualMigo: adjunto,
    actualFactura: null,
    actualFechaFactura: null,
    patch: { factura: adjunto },
  });
  assert.equal(result.estadoFinal, "pendiente_pago");
  assert.match(String(result.patch.fecha_factura), /^\d{4}-\d{2}-\d{2}$/);
});

test("quitar una factura devuelve el estado y limpia sus datos", () => {
  const result = aplicarTransicionPrefactura({
    actualEstado: "pendiente_pago",
    actualActa: adjunto,
    actualMigo: adjunto,
    actualFactura: adjunto,
    actualFechaFactura: "2026-08-01",
    patch: { factura: null, numero_factura: "AGF-1" },
  });
  assert.equal(result.estadoFinal, "por_facturar");
  assert.equal(result.patch.fecha_factura, null);
  assert.equal(result.patch.numero_factura, null);
});

test("vencimientoPrefactura usa 30 días por regla AG y 45 en Recolección", async () => {
  const { diasVencimientoDe, vencimientoPrefactura } = await import("@/lib/aaa/catalogo");
  assert.equal(diasVencimientoDe("alquiler"), 30);
  assert.equal(diasVencimientoDe("recoleccion"), 45);
  assert.equal(vencimientoPrefactura("alquiler", "2026-01-15"), "2026-02-14");
  assert.equal(vencimientoPrefactura("recoleccion", "2026-01-15"), "2026-03-01");
  assert.equal(vencimientoPrefactura("recoleccion", "15-01-2026"), "");
});
