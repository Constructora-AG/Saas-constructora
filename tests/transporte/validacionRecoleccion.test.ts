import assert from "node:assert/strict";
import test from "node:test";

import {
  claveRecoleccionValida,
  validarAdjuntoRecoleccion,
  validarAdminRecoleccion,
  validarEscrituraRecoleccion,
  validarFechasPrefacturaRecoleccion,
  validarItemsPrefacturaRecoleccion,
  validarMesRecoleccion,
  validarTarifarioRecoleccion,
} from "@/lib/transporte/validacionRecoleccion";
import { TARIFARIO_RECOLECCION_DEFAULT } from "@/lib/transporte/constants";

/** Registro válido de recolección (8 h × $100.000 sin IVA). */
function servicio(extra: Record<string, unknown> = {}) {
  return {
    id: "s1", date: "2026-11-10", orderNo: "RE0001", serviceType: "Programado",
    plate: "ABC-123", equipment: "Volqueta sencilla (incluye ayudantes)", areaAAA: "Recolección y Transporte",
    planilla: "F-001", numeroInterno: "VS-01", ruta: "Ruta 4", actividad: "Escombros",
    horaSalida: "06:00", horaRetorno: "14:30", horometroInicial: "1000", horometroFinal: "1008",
    horasMaquina: "8", valorHora: "100000", value: "800000", valorIva: "152000", ivaAlquiler: true,
    tolls: "0", ayudantes: ["Pedro", "Juan"], photoFiles: [], approvalFile: null,
    ...extra,
  };
}

const mes = (items: unknown[], anterior: unknown[] | null = null) =>
  validarMesRecoleccion("services:2026-11", items, anterior);

test("solo se escriben las claves del módulo de recolección", () => {
  assert.equal(claveRecoleccionValida("adminconfig"), true);
  assert.equal(claveRecoleccionValida("tarifario"), true);
  assert.equal(claveRecoleccionValida("services:2026-11"), true);
  assert.equal(claveRecoleccionValida("services:2026-13"), false);
  assert.equal(claveRecoleccionValida("tarifario_costo"), false);
  assert.equal(claveRecoleccionValida("cualquier-cosa"), false);
  assert.match(validarEscrituraRecoleccion("otra", "[]", null)?.error ?? "", /no es del Contrato de Recolección/);
  assert.match(validarEscrituraRecoleccion("services:2026-11", "{no json", null)?.error ?? "", /JSON/);
});

test("un registro correcto de recolección pasa", () => {
  assert.equal(mes([servicio()]), null);
});

test("el horómetro, las horas y el valor deben ser coherentes", () => {
  assert.match(mes([servicio({ horometroFinal: "990" })])?.error ?? "", /horómetro final/);
  assert.match(mes([servicio({ horasMaquina: "9", value: "900000", valorIva: "171000" })])?.error ?? "", /no coinciden con el horómetro/);
  assert.match(mes([servicio({ value: "850000" })])?.error ?? "", /no corresponde a 8 h/);
  assert.match(mes([servicio({ valorIva: "0" })])?.error ?? "", /19%/);
  assert.match(mes([servicio({ ivaAlquiler: false })])?.error ?? "", /debe llevar IVA/);
  assert.match(mes([servicio({ horometroInicial: "0", horometroFinal: "30", horasMaquina: "30", value: "3000000", valorIva: "570000" })])?.error ?? "", /máximo de 24 h/);
  assert.match(mes([servicio({ horasMaquina: "-1" })])?.error ?? "", /mayor o igual a 0/);
});

test("reglas propias del contrato: peajes, ayudantes, actividad, horas y fecha del mes", () => {
  assert.match(mes([servicio({ tolls: "15000" })])?.error ?? "", /peajes/);
  assert.match(mes([servicio({ ayudantes: ["A", "B", "C"] })])?.error ?? "", /máximo 2 ayudantes/);
  assert.match(mes([servicio({ equipment: "Volqueta dobletroque" })])?.error ?? "", /solo aplican a la volqueta sencilla/);
  assert.equal(mes([servicio({ equipment: "Volqueta dobletroque", ayudantes: [] })]), null);
  assert.match(mes([servicio({ actividad: "Paseo" })])?.error ?? "", /no es de la planilla/);
  assert.match(mes([servicio({ horaSalida: "25:00" })])?.error ?? "", /HH:MM/);
  assert.match(mes([servicio({ date: "2026-12-01" })])?.error ?? "", /no pertenece al mes/);
  assert.match(mes([servicio({ date: "2026-11-31" })])?.error ?? "", /fecha no es válida/);
  assert.match(mes([servicio({ photoFiles: [{ name: "f.jpg", dataUrl: "data:image/jpeg;base64,AA" }] })])?.error ?? "", /subirse a Storage/);
  assert.match(mes([servicio(), servicio()])?.error ?? "", /repetido/);
});

test("los registros que no cambian no se revalidan (datos heredados del contrato creado en la app)", () => {
  const heredado = { id: "viejo", date: "2026-11-02", value: "100", tolls: "5000" }; // hoy sería inválido
  assert.equal(mes([heredado, servicio()], [heredado]), null);
  assert.match(mes([{ ...heredado, notes: "editado" }], [heredado])?.error ?? "", /peajes/);
});

test("tarifario: valores no negativos, sin repetidos y sin ceros de más", () => {
  assert.equal(validarTarifarioRecoleccion(TARIFARIO_RECOLECCION_DEFAULT), null);
  const con = (unitario: unknown) => ({ ...TARIFARIO_RECOLECCION_DEFAULT, categorias: [{ id: "rec1", label: "Dobletroque", capacidad: "", rutas: [{ id: "1.1", label: "R&T (HR)", unitario }] }] });
  assert.equal(validarTarifarioRecoleccion(con(180000)), null);
  assert.match(validarTarifarioRecoleccion(con(-5))?.error ?? "", /mayor o igual a 0/);
  assert.match(validarTarifarioRecoleccion(con(180000000))?.error ?? "", /máximo esperado/);
  assert.match(validarTarifarioRecoleccion({ categorias: "x" })?.error ?? "", /categorías/);
});

test("administración: vigencia, flota y personal (solo lo que cambia)", () => {
  const base = { contractStart: "2026-10-20", contractEnd: "2027-10-19", contractValue: 3746015451, areas: [], interventores: [], vehiculos: [], personal: [] };
  assert.equal(validarAdminRecoleccion(base, null), null);
  assert.match(validarAdminRecoleccion({ ...base, contractEnd: "2026-10-01" }, base)?.error ?? "", /posterior/);
  assert.match(validarAdminRecoleccion({ ...base, contractValue: -1 }, base)?.error ?? "", /valor del contrato/);
  const veh = { plate: "ABC-123", tipo: "Volqueta sencilla", capacity: "8", modelo: "2018", activo: true };
  assert.equal(validarAdminRecoleccion({ ...base, vehiculos: [veh] }, base), null);
  assert.match(validarAdminRecoleccion({ ...base, vehiculos: [{ ...veh, modelo: "1800" }] }, base)?.error ?? "", /modelo/);
  assert.match(validarAdminRecoleccion({ ...base, vehiculos: [veh, veh] }, base)?.error ?? "", /repetida/);
  assert.match(validarAdminRecoleccion({ ...base, personal: [{ nombre: "Ana", rol: "jefe" }] }, base)?.error ?? "", /conductor o ayudante/);
  // Un vehículo heredado con datos raros no bloquea si no se toca.
  const raro = { plate: "x", capacity: "-3" };
  assert.equal(validarAdminRecoleccion({ ...base, vehiculos: [raro] }, { ...base, vehiculos: [raro] }), null);
});

test("adjuntos: solo fotos o PDF, ligados a un mes y un registro", () => {
  assert.equal(validarAdjuntoRecoleccion("image/jpeg", "image/jpeg", "2026-11", "s123abc"), null);
  assert.equal(validarAdjuntoRecoleccion("application/pdf", "application/pdf", "2026-11", "s123abc"), null);
  assert.match(validarAdjuntoRecoleccion("text/html", "text/html", "2026-11", "s1")?.error ?? "", /fotos/);
  assert.match(validarAdjuntoRecoleccion("image/png", "text/html", "2026-11", "s1")?.error ?? "", /no coincide/);
  assert.match(validarAdjuntoRecoleccion("image/png", undefined, "sin-mes", "s1")?.error ?? "", /mes/);
  assert.match(validarAdjuntoRecoleccion("image/png", undefined, "2026-11", "../x")?.error ?? "", /identificador/);
});

test("prefacturas de recolección: fechas, periodo e ítems con IVA", () => {
  assert.equal(validarFechasPrefacturaRecoleccion({ fecha_generacion: "2026-11-30", periodo_desde: "2026-11-01", periodo_hasta: "2026-11-30" }), null);
  assert.match(validarFechasPrefacturaRecoleccion({ fecha_generacion: "30/11/2026" })?.error ?? "", /generación/);
  assert.match(validarFechasPrefacturaRecoleccion({ periodo_desde: "2026-11-30", periodo_hasta: "2026-11-01" })?.error ?? "", /termina antes/);
  const item = { item: "Servicio de Volqueta sencilla - Recolección y Transporte", unidad: "HR", cantidad: 8, vr_unit: 100000, iva_pct: 0.19 };
  assert.equal(validarItemsPrefacturaRecoleccion([item]), null);
  assert.match(validarItemsPrefacturaRecoleccion([{ ...item, vr_unit: 0 }])?.error ?? "", /mayor que 0/);
  assert.match(validarItemsPrefacturaRecoleccion([{ ...item, iva_pct: 0 }])?.error ?? "", /19%/);
  assert.match(validarItemsPrefacturaRecoleccion([])?.error ?? "", /al menos un ítem/);
});
