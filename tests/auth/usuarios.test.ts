import assert from "node:assert/strict";
import test from "node:test";

import {
  esRolUsuario,
  limpiarModulos,
  normalizarEmail,
  normalizarNombre,
  puedeCambiarRolPropio,
  puedeEliminarCuentaPropia,
} from "@/lib/auth/usuarios";

test("normalizarEmail acepta, recorta y normaliza correos válidos", () => {
  assert.equal(normalizarEmail("  ADMIN@EXAMPLE.COM "), "admin@example.com");
});

test("normalizarEmail rechaza valores ausentes y formatos inválidos", () => {
  assert.equal(normalizarEmail(undefined), null);
  assert.equal(normalizarEmail("sin-arroba"), null);
  assert.equal(normalizarEmail("usuario@example"), null);
  assert.equal(normalizarEmail("usuario @example.com"), null);
});

test("normalizarNombre recorta espacios y rechaza nombres vacíos", () => {
  assert.equal(normalizarNombre("  Ana Giraldo  "), "Ana Giraldo");
  assert.equal(normalizarNombre("   "), null);
  assert.equal(normalizarNombre(null), null);
});

test("esRolUsuario solo acepta los roles de la plataforma", () => {
  assert.equal(esRolUsuario("superadmin"), true);
  assert.equal(esRolUsuario("operacion"), true);
  assert.equal(esRolUsuario("comercial"), true);
  assert.equal(esRolUsuario("finanzas"), true);
  assert.equal(esRolUsuario("gerencia"), false);
  assert.equal(esRolUsuario("administrador"), false);
  assert.equal(esRolUsuario(undefined), false);
});

test("limpiarModulos conserva módulos otorgables, elimina duplicados y descarta inválidos", () => {
  assert.deepEqual(
    limpiarModulos(["cartera", "cartera", "usuarios", "inventado", 42]),
    ["cartera"],
  );
  assert.deepEqual(limpiarModulos(undefined), []);
  assert.deepEqual(limpiarModulos("cartera"), []);
});

test("los módulos exclusivos de superadmin no se pueden otorgar como extras", () => {
  assert.deepEqual(limpiarModulos(["usuarios", "configuracion_ia"]), []);
});

test("un superadmin no puede quitarse su propio rol", () => {
  assert.equal(puedeCambiarRolPropio("admin-1", "admin-1", "operacion"), false);
  assert.equal(puedeCambiarRolPropio("admin-1", "admin-1", "superadmin"), true);
});

test("un superadmin puede cambiar el rol de otra cuenta", () => {
  assert.equal(puedeCambiarRolPropio("admin-1", "usuario-2", "operacion"), true);
});

test("un superadmin no puede eliminar su propia cuenta", () => {
  assert.equal(puedeEliminarCuentaPropia("admin-1", "admin-1"), false);
  assert.equal(puedeEliminarCuentaPropia("admin-1", "usuario-2"), true);
});
