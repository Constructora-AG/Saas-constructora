import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { NextRequest, NextResponse } from "next/server";

const denied = () => NextResponse.json({ error: "No autorizado para este módulo" }, { status: 403 });

mock.module("@/lib/auth/servidor", {
  namedExports: {
    exigirModulo: async () => denied(),
    exigirCualquieraDeModulos: async () => denied(),
    exigirRol: async () => NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    esRespuestaAutorizacion: (value: unknown): value is NextResponse => value instanceof NextResponse,
  },
});

mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    supabaseTransporte: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    supabaseServer: async () => null,
  },
});

mock.module("@/lib/smarthome/client", {
  namedExports: {
    rest: {},
    bi: {},
    SmarthomeError: class extends Error {},
  },
});

type Routes = {
  prefacturas: typeof import("@/app/api/aaa/prefacturas/route");
  facturas: typeof import("@/app/api/aaa/facturas/route");
  transporte: typeof import("@/app/api/aaa/transporte/route");
  marketingData: typeof import("@/app/api/marketing/data/route");
  marketingInversion: typeof import("@/app/api/marketing/inversion/route");
  gestion: typeof import("@/app/api/gestion/route");
  bi: typeof import("@/app/api/bi/[endpoint]/route");
};

let routes: Routes | undefined;

async function loadRoutes(): Promise<Routes> {
  routes ??= {
    prefacturas: await import("@/app/api/aaa/prefacturas/route"),
    facturas: await import("@/app/api/aaa/facturas/route"),
    transporte: await import("@/app/api/aaa/transporte/route"),
    marketingData: await import("@/app/api/marketing/data/route"),
    marketingInversion: await import("@/app/api/marketing/inversion/route"),
    gestion: await import("@/app/api/gestion/route"),
    bi: await import("@/app/api/bi/[endpoint]/route"),
  };
  return routes;
}

test("los endpoints financieros rechazan un usuario sin módulo antes de tocar datos", async () => {
  const r = await loadRoutes();
  const prefacturas = await r.prefacturas.GET(new NextRequest("https://app.test/api/aaa/prefacturas?contrato=alquiler"));
  assert.equal(prefacturas.status, 403);

  const facturas = await r.facturas.GET(new NextRequest("https://app.test/api/aaa/facturas?contrato=alquiler"));
  assert.equal(facturas.status, 403);

  const transporte = await r.transporte.GET(new NextRequest("https://app.test/api/aaa/transporte?ns=alquiler&key=adminconfig"));
  assert.equal(transporte.status, 403);
});

test("los endpoints de operación y marketing rechazan roles insuficientes", async () => {
  const r = await loadRoutes();
  const marketingData = await r.marketingData.GET(new NextRequest("https://app.test/api/marketing/data"));
  assert.equal(marketingData.status, 403);

  const inversion = await r.marketingInversion.POST(new NextRequest("https://app.test/api/marketing/inversion", {
    method: "POST",
    body: JSON.stringify({ mes: "2026-11", monto: 100 }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(inversion.status, 403);

  const gestion = await r.gestion.POST(new NextRequest("https://app.test/api/gestion", {
    method: "POST",
    body: JSON.stringify({ prospect_id: "p-1", canal: "whatsapp" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(gestion.status, 403);
});

test("el endpoint BI no permite consultar datos sin rol superadmin", async () => {
  const r = await loadRoutes();
  const response = await r.bi.GET(
    new NextRequest("https://app.test/api/bi/getProjectSummary"),
    { params: Promise.resolve({ endpoint: "getProjectSummary" }) },
  );
  assert.equal(response.status, 403);
});

test("la recuperación de contraseña valida el correo sin revelar si existe", async () => {
  const route = await import("@/app/api/usuarios/password-recovery/route");
  const response = await route.POST(new NextRequest("https://app.test/api/usuarios/password-recovery", {
    method: "POST",
    body: JSON.stringify({ email: "correo-invalido" }),
    headers: { "content-type": "application/json" },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Correo electrónico inválido" });
});

