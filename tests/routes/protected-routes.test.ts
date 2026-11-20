import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { NextRequest, NextResponse } from "next/server";

interface QueryResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

const currentUser = { id: "admin-1", email: "admin@example.com", nombre: "Admin", rol: "superadmin", modulos: [] };
const state = {
  usuarios: [{ id: "user-1", email: "ana@example.com", nombre: "Ana", rol: "operacion", modulos: [] }],
  prefacturas: [{ numero: "PF0003" }],
  insertedUser: null as Record<string, unknown> | null,
  insertedPrefactura: null as Record<string, unknown> | null,
  upserted: null as Record<string, unknown> | null,
};

function resultFor(table: string, kind: string, single: boolean): QueryResult {
  if (kind === "select" && table === "usuarios") return { data: single ? currentUser : state.usuarios, error: null };
  if (kind === "select" && table === "aaa_prefacturas") return { data: state.prefacturas, error: null };
  if (kind === "insert" && table === "usuarios") return { data: null, error: null };
  if (kind === "insert" && table === "aaa_prefacturas") return { data: state.insertedPrefactura, error: null };
  if (kind === "upsert" && table === "transporte_kv") return { data: null, error: null };
  return { data: null, error: null };
}

class Query implements PromiseLike<QueryResult> {
  private kind = "select";
  private singleResult = false;

  public constructor(private readonly table: string) {}

  select(): this { return this; }
  order(): this { return this; }
  eq(): this { return this; }
  maybeSingle(): this { this.singleResult = true; return this; }
  single(): this { this.singleResult = true; return this; }
  update(): this { this.kind = "update"; return this; }
  insert(row: Record<string, unknown>): this {
    this.kind = "insert";
    if (this.table === "usuarios") state.insertedUser = row;
    if (this.table === "aaa_prefacturas") state.insertedPrefactura = { id: "pf-1", ...row };
    return this;
  }
  upsert(row: Record<string, unknown>): this {
    this.kind = "upsert";
    if (this.table === "usuarios") state.insertedUser = row;
    if (this.table === "transporte_kv") state.upserted = row;
    return this;
  }
  delete(): this { this.kind = "delete"; return this; }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(resultFor(this.table, this.kind, this.singleResult)).then(onfulfilled, onrejected);
  }
}

const supabase = {
  from(table: string) { return new Query(table); },
  auth: {
    admin: {
      createUser: async () => ({ data: { user: { id: "user-new" } }, error: null }),
      updateUserById: async () => ({ error: null }),
      deleteUser: async () => ({ error: null }),
    },
  },
};

mock.module("@/lib/auth/servidor", {
  namedExports: {
    exigirGerencia: undefined,
    exigirModulo: async () => currentUser,
    exigirCualquieraDeModulos: async () => currentUser,
    esRespuestaAutorizacion: (value: unknown): value is NextResponse => value instanceof NextResponse,
  },
});
mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseAdmin: () => supabase,
    supabaseTransporte: () => supabase,
    supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
  },
});
mock.module("@/lib/smarthome/client", {
  namedExports: {
    rest: {},
    bi: {},
    SmarthomeError: class extends Error {},
  },
});

type Routes = [
  typeof import("@/app/api/usuarios/route"),
  typeof import("@/app/api/aaa/prefacturas/route"),
  typeof import("@/app/api/aaa/transporte/route"),
  typeof import("@/app/api/cartera/sync/route"),
  typeof import("@/app/api/asistente/config/route"),
];

let routes: Routes | undefined;

async function loadRoutes(): Promise<Routes> {
  routes ??= await Promise.all([
    import("@/app/api/usuarios/route"),
    import("@/app/api/aaa/prefacturas/route"),
    import("@/app/api/aaa/transporte/route"),
    import("@/app/api/cartera/sync/route"),
    import("@/app/api/asistente/config/route"),
  ]);
  return routes;
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/usuarios normaliza y persiste una cuenta autorizada", async () => {
  const [usuariosRoute] = await loadRoutes();
  const response = await usuariosRoute.POST(jsonRequest("https://app.test/api/usuarios", {
    email: " ANA@EXAMPLE.COM ", nombre: " Ana Giraldo ", rol: "operacion", password: "segura123", modulos: ["cartera", "inventado"],
  }));
  assert.equal(response.status, 200);
  assert.equal(state.insertedUser?.email, "ana@example.com");
  assert.equal(state.insertedUser?.nombre, "Ana Giraldo");
  assert.deepEqual(state.insertedUser?.modulos, ["cartera"]);
});

test("POST /api/aaa/prefacturas calcula vencimiento, consecutivo e ítems", async () => {
  const [, prefacturasRoute] = await loadRoutes();
  const response = await prefacturasRoute.POST(jsonRequest("https://app.test/api/aaa/prefacturas", {
    contrato: "alquiler",
    fecha_generacion: "2026-01-15",
    soporte: { name: "soporte.pdf", type: "application/pdf", dataUrl: "data:application/pdf;base64,AA==" },
    items: [{ item: "Alq excavadora sobre oruga 22 m", cantidad: 2, vr_unit: 344500 }],
  }));
  assert.equal(response.status, 200);
  assert.equal(state.insertedPrefactura?.numero, "PF0004");
  assert.equal(state.insertedPrefactura?.fecha_vencimiento, "2026-02-14");
  assert.equal(state.insertedPrefactura?.valor_base, 689000);
});

test("POST /api/aaa/transporte rechaza namespaces y claves cruzadas", async () => {
  const [, , transporteRoute] = await loadRoutes();
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const invalidNamespace = await transporteRoute.POST(jsonRequest("https://app.test/api/aaa/transporte", { ns: "../externo", key: "adminconfig", value: "{}" }));
    assert.equal(invalidNamespace.status, 400);

    const crossNamespace = await transporteRoute.POST(jsonRequest("https://app.test/api/aaa/transporte", { ns: "alquiler", key: "services:2026-11", value: "[]" }));
    assert.equal(crossNamespace.status, 403);
    assert.equal(state.upserted, null);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("POST /api/cartera/sync rechaza solicitudes sin secreto antes de tocar Supabase", async () => {
  const [, , , carteraSyncRoute] = await loadRoutes();
  const previousCron = process.env.CRON_SECRET;
  const previousSync = process.env.CARTERA_SYNC_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.CARTERA_SYNC_SECRET;
  try {
    const response = await carteraSyncRoute.POST(new NextRequest("https://app.test/api/cartera/sync", { method: "POST" }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "No autorizado" });
  } finally {
    if (previousCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
    if (previousSync === undefined) delete process.env.CARTERA_SYNC_SECRET;
    else process.env.CARTERA_SYNC_SECRET = previousSync;
  }
});

test("GET /api/asistente/config exige superadmin y no expone la clave completa", async () => {
  const [, , , , asistenteConfigRoute] = await loadRoutes();
  const response = await asistenteConfigRoute.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tiene_clave, false);
  assert.equal(body.api_key, "");
  assert.equal(typeof body.proveedores, "object");
  assert.ok(body.proveedores && Object.keys(body.proveedores).length > 0);
});

