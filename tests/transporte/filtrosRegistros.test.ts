import assert from "node:assert/strict";
import test from "node:test";

import { aplicarFiltros, etiquetasActivas, filtrosVigentes, FILTROS_REGISTROS, opcionesFiltro, SIN_DATO } from "@/lib/transporte/filtrosRegistros";
import type { Servicio } from "@/lib/transporte/model";

const servicio = (id: string, campos: Partial<Servicio>) => ({ id, plate: "", driver: "", interventor: "", serviceType: "Programado", ...campos }) as Servicio;
const filtro = (id: string) => FILTROS_REGISTROS.find((f) => f.id === id)!;

const items = [
  servicio("1", { areaAAA: "Disposición Final", plate: "ABC123" }),
  servicio("2", { areaAAA: "Disposición Final", plate: "XYZ789", prefactura: "PF0001" }),
  servicio("3", { areaSolicitante: "Jefatura de Operaciones", plate: "ABC123" }),
  servicio("4", { plate: "ABC123" }),
];

test("aplicarFiltros combina filtros y usa el alias legado del Área AAA", () => {
  assert.deepEqual(aplicarFiltros(items, { area: "Jefatura de Operaciones" }).map((s) => s.id), ["3"]);
  assert.deepEqual(aplicarFiltros(items, { area: "Disposición Final", placa: "ABC123" }).map((s) => s.id), ["1"]);
  assert.deepEqual(aplicarFiltros(items, { area: SIN_DATO }).map((s) => s.id), ["4"]);
  assert.deepEqual(aplicarFiltros(items, { prefactura: "Sin prefacturar" }).map((s) => s.id), ["1", "3", "4"]);
  assert.equal(aplicarFiltros(items, {}).length, 4);
});

test("opcionesFiltro cuenta según los demás filtros y deja «sin dato» al final", () => {
  assert.deepEqual(opcionesFiltro(items, filtro("area"), {}), [
    { valor: "Disposición Final", cantidad: 2, label: "Disposición Final" },
    { valor: "Jefatura de Operaciones", cantidad: 1, label: "Jefatura de Operaciones" },
    { valor: SIN_DATO, cantidad: 1, label: "Sin área AAA" },
  ]);
  assert.deepEqual(opcionesFiltro(items, filtro("area"), { placa: "XYZ789" }).map((o) => [o.valor, o.cantidad]), [["Disposición Final", 1]]);
  // La opción elegida se conserva aunque los demás filtros la dejen en 0.
  assert.deepEqual(opcionesFiltro(items, filtro("area"), { area: "Jefatura de Operaciones", placa: "XYZ789" }).map((o) => [o.valor, o.cantidad]), [["Disposición Final", 1], ["Jefatura de Operaciones", 0]]);
});

test("filtrosVigentes descarta valores que no existen y etiquetasActivas los nombra", () => {
  assert.deepEqual(filtrosVigentes(items, { area: "Otra área", placa: "ABC123", tipo: "" }), { placa: "ABC123" });
  assert.deepEqual(etiquetasActivas({ placa: "ABC123", area: SIN_DATO }), ["Sin área AAA", "ABC123"]);
});
