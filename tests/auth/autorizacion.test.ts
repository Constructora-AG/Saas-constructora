import assert from "node:assert/strict";
import test from "node:test";

import {
  MODULOS,
  MODULOS_OTORGABLES,
  moduloDeRuta,
  puedeVer,
  rutaInicial,
  type RolPlataforma,
} from "@/lib/auth/modulos";
import { areasDe, tablasPermitidas, validarAlcanceSql } from "@/lib/asistente/alcance";

const usuario = (rol: RolPlataforma, modulos: string[] = []) => ({ rol, modulos });

test("cada rol solo ve sus módulos predeterminados", () => {
  assert.equal(puedeVer(usuario("superadmin"), "usuarios"), true);
  assert.equal(puedeVer(usuario("operacion"), "cartera"), true);
  assert.equal(puedeVer(usuario("operacion"), "marketing"), false);
  assert.equal(puedeVer(usuario("comercial"), "marketing"), true);
  assert.equal(puedeVer(usuario("comercial"), "aaa"), false);
  assert.equal(puedeVer(usuario("finanzas"), "transporte"), true);
  assert.equal(puedeVer(usuario("finanzas"), "cartera"), false);
});

test("los módulos administrativos no se pueden escalar con módulos extra", () => {
  const otorgables = new Set(MODULOS_OTORGABLES.map((m) => m.id));
  assert.equal(otorgables.has("usuarios"), false);
  assert.equal(otorgables.has("configuracion_ia"), false);
  assert.equal(puedeVer(usuario("operacion", ["usuarios", "configuracion_ia"]), "usuarios"), false);
  assert.equal(puedeVer(usuario("operacion", ["marketing"]), "marketing"), true);
  assert.equal(puedeVer(null, "cartera"), false);
  assert.equal(puedeVer(usuario("operacion"), "modulo-inexistente"), false);
});

test("las rutas resuelven el módulo más específico y no inventan accesos", () => {
  assert.equal(moduloDeRuta("/aaa/transporte/registros")?.id, "transporte");
  assert.equal(moduloDeRuta("/aaa/contrato-alquiler")?.id, "alquiler");
  assert.equal(moduloDeRuta("/ruta-inexistente"), null);
  assert.equal(rutaInicial(usuario("comercial")), "/marketing");
  assert.equal(rutaInicial(usuario("finanzas")), "/aaa");
});

test("el alcance del asistente queda aislado por rol y nunca expone tablas sensibles", () => {
  const operacion = usuario("operacion");
  const comercial = usuario("comercial");
  const tablasOperacion = tablasPermitidas(operacion);
  const tablasComercial = tablasPermitidas(comercial);

  assert.deepEqual(areasDe(operacion), ["cartera", "vendedores"]);
  assert.deepEqual(areasDe(comercial), ["marketing"]);
  assert.equal(tablasOperacion.has("aaa_prefacturas"), false);
  assert.equal(tablasComercial.has("cartera_gestion"), false);
  assert.match(String(validarAlcanceSql("select * from aaa_prefacturas", tablasOperacion)), /Sin permiso/);
  assert.match(String(validarAlcanceSql("select * from usuarios", tablasComercial)), /no está disponible/);
  assert.match(String(validarAlcanceSql("select * from pg_catalog.pg_tables", tablasOperacion)), /catálogos del sistema/);
  assert.equal(validarAlcanceSql("select * from cartera", tablasOperacion), null);
});

test("el catálogo de módulos mantiene hrefs únicos y rutas protegibles", () => {
  const hrefs = MODULOS.map((m) => m.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const modulo of MODULOS) assert.equal(typeof modulo.id, "string");
});

