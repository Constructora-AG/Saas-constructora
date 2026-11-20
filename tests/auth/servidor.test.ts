import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { NextResponse } from "next/server";

interface QueryResult {
  data: Record<string, unknown> | null;
  error: null;
}

let authenticatedUser: { id: string; email?: string } | null = { id: "u-1", email: "ana@example.com" };
let profile: Record<string, unknown> | null = {
  id: "u-1",
  email: "ana@example.com",
  nombre: "Ana",
  rol: "operacion",
  modulos: [],
};

const query = {
  select() { return this; },
  eq() { return this; },
  maybeSingle(): Promise<QueryResult> {
    return Promise.resolve({ data: profile, error: null });
  },
};

mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: authenticatedUser } }) } }),
    supabaseAdmin: () => ({ from: () => query }),
  },
});

let authModule: typeof import("@/lib/auth/servidor") | undefined;

async function auth() {
  authModule ??= await import("@/lib/auth/servidor");
  return authModule;
}

test("usuarioServidor usa la identidad de Auth y el perfil server-side", async () => {
  const { usuarioServidor } = await auth();
  const user = await usuarioServidor();
  assert.deepEqual(user, {
    id: "u-1",
    email: "ana@example.com",
    nombre: "Ana",
    rol: "operacion",
    modulos: [],
  });
});

test("exigirModulo permite el módulo propio y rechaza otro rol", async () => {
  const { exigirModulo, esRespuestaAutorizacion } = await auth();
  const permitido = await exigirModulo("cartera");
  assert.equal(esRespuestaAutorizacion(permitido), false);

  const rechazado = await exigirModulo("marketing");
  assert.equal(esRespuestaAutorizacion(rechazado), true);
  if (rechazado instanceof NextResponse) {
    assert.equal(rechazado.status, 403);
    assert.deepEqual(await rechazado.json(), { error: "No autorizado para este módulo" });
  }
});

test("exigirRol y exigirCualquieraDeModulos no confunden autenticación con autorización", async () => {
  const { exigirRol, exigirCualquieraDeModulos, esRespuestaAutorizacion } = await auth();
  assert.equal(esRespuestaAutorizacion(await exigirRol("superadmin")), true);
  assert.equal(esRespuestaAutorizacion(await exigirCualquieraDeModulos(["marketing", "aaa"])), true);

  authenticatedUser = null;
  const noAutenticado = await exigirRol("operacion");
  assert.equal(esRespuestaAutorizacion(noAutenticado), true);
  if (noAutenticado instanceof NextResponse) {
    assert.equal(noAutenticado.status, 401);
    assert.deepEqual(await noAutenticado.json(), { error: "No autenticado" });
  }
  authenticatedUser = { id: "u-1", email: "ana@example.com" };
});

test("un perfil con rol inválido no obtiene permisos aunque tenga sesión", async () => {
  const { usuarioServidor } = await auth();
  profile = { ...profile, rol: "gerencia" };
  assert.equal(await usuarioServidor(), null);
  profile = {
    id: "u-1",
    email: "ana@example.com",
    nombre: "Ana",
    rol: "operacion",
    modulos: [],
  };
});

