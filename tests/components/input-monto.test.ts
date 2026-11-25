import assert from "node:assert/strict";
import test from "node:test";

import { montoCrudo, montoDigitado, montoVisible } from "@/app/components/InputMonto";

test("lo digitado se guarda como número crudo", () => {
  assert.equal(montoCrudo("$ 185.000"), "185000");
  assert.equal(montoCrudo("1850001"), "1850001");
  assert.equal(montoCrudo("$ 16.263.151,66"), "16263151.66");
  assert.equal(montoCrudo("16263151.66"), "16263151.66"); // pegado con punto decimal
  assert.equal(montoCrudo("$ 1.234,"), "1234."); // coma final: se sigue escribiendo
  assert.equal(montoCrudo("1,239"), "1.23"); // máximo 2 decimales
  assert.equal(montoCrudo("007"), "7");
  assert.equal(montoCrudo("abc"), "");
  assert.equal(montoCrudo(""), "");
});

test("el campo muestra pesos con miles y coma decimal", () => {
  assert.equal(montoVisible("185000"), "$ 185.000");
  assert.equal(montoVisible("2891433496"), "$ 2.891.433.496");
  assert.equal(montoVisible("16263151.66"), "$ 16.263.151,66");
  assert.equal(montoVisible("1234."), "$ 1.234,");
  assert.equal(montoVisible("0"), "$ 0");
  assert.equal(montoVisible(""), "");
});

test("el valor crudo lo interpretan igual los formularios", () => {
  for (const c of ["185000", "16263151.66", "1234."]) {
    assert.equal(montoDigitado(c), Number(c));
  }
});
