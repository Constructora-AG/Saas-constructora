import assert from "node:assert/strict";
import test from "node:test";

import { buildLeadInput, resolveLeadProjectId } from "@/lib/smarthome/leads";
import { callSmarthome, SmarthomeError } from "@/lib/smarthome/http";
import { BI_ENDPOINTS } from "@/lib/smarthome/bi";

const datosBase = {
  first_name: "Ana",
  last_name: "Giraldo",
  email: "ana@example.com",
  mobile_number: "+573001112233",
  origin: "web",
};

interface ReceivedRequest {
  url: string;
  init?: RequestInit;
}

function requireReceived(value: ReceivedRequest | null): ReceivedRequest {
  if (!value) throw new Error("No se recibió la solicitud de prueba");
  return value;
}

test("resolveLeadProjectId prioriza projectId y luego resuelve código o nombre", () => {
  assert.equal(resolveLeadProjectId({ projectId: "id-encriptado", projectCode: "3e7aa5be" }), "id-encriptado");
  assert.equal(resolveLeadProjectId({ projectCode: "3e7aa5be" }), "f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW");
  assert.equal(resolveLeadProjectId({ projectName: "aqua club residencial" }), "f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW");
  assert.equal(resolveLeadProjectId({ projectCode: "no-existe", projectName: "no existe" }), undefined);
});

test("buildLeadInput conserva el payload actual y el comentario de Habeas Data", () => {
  const result = buildLeadInput({ ...datosBase, projectCode: "3e7aa5be", locationSourceId: 7, scoring: 25, fieldList: [{ name: "ingresos", value: "alto" }] });
  assert.deepEqual(result, {
    lead: {
      ...datosBase,
      comment: "Lead web. Habeas Data: SI.",
      projectId: "f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW",
      locationSourceId: "7",
      scoring: "25",
      fieldList: [{ name: "ingresos", value: "alto" }],
    },
  });
});

test("buildLeadInput respeta comentario explícito y omite opcionales ausentes", () => {
  const result = buildLeadInput({ ...datosBase, projectName: "Lotes Reservas del Manantial", comment: "Acepto tratamiento de datos" });
  assert.equal("error" in result, false);
  if (!("error" in result)) {
    assert.equal(result.lead.comment, "Acepto tratamiento de datos");
    assert.equal(result.lead.projectId, "Jfu27K0-XC-GcbFuH6Gk9akQ2UasRekBeWPhU/p3/Kcf53dZLTusfebhD75ZUitB");
    assert.equal(result.lead.locationSourceId, undefined);
    assert.equal(result.lead.fieldList, undefined);
  }
});

test("buildLeadInput rechaza proyecto ausente o campos requeridos vacíos", () => {
  assert.deepEqual(buildLeadInput(datosBase), { error: "Falta projectId/projectCode/projectName válido" });
  for (const field of ["first_name", "last_name", "email", "mobile_number", "origin"] as const) {
    const result = buildLeadInput({ ...datosBase, projectCode: "3e7aa5be", [field]: "" });
    assert.deepEqual(result, { error: `Falta campo: ${field}` });
  }
});

test("callSmarthome envía JSON, API key y cache no-store", async () => {
  const originalFetch = globalThis.fetch;
  let received: ReceivedRequest | null = null;
  globalThis.fetch = async (input, init) => {
    received = { url: String(input), init };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await callSmarthome<{ ok: boolean }>("https://smart.test/api/leadForm/", "api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "id" }),
    });
    assert.deepEqual(result, { ok: true });
    const requestData = requireReceived(received);
    assert.equal(requestData.url, "https://smart.test/api/leadForm/");
    assert.equal(requestData.init?.cache, "no-store");
    assert.equal(new Headers(requestData.init?.headers).get("ApiKey"), "api-key");
    assert.equal(new Headers(requestData.init?.headers).get("Accept"), "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callSmarthome limita el cuerpo de errores no exitosos a 500 caracteres", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("x".repeat(700), { status: 429 });
  try {
    await assert.rejects(
      callSmarthome("https://smart.test/api/leadForm/", "", undefined),
      (error: unknown) => error instanceof SmarthomeError && error.status === 429 && error.body?.length === 500,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callSmarthome identifica respuestas no JSON y respuestas vacías", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [new Response("not-json", { status: 200 }), new Response("", { status: 200 })];
  globalThis.fetch = async () => responses.shift()!;
  try {
    await assert.rejects(callSmarthome("https://smart.test/api/leadForm/", ""), (error: unknown) => error instanceof SmarthomeError && error.message === "Respuesta no-JSON");
    assert.equal(await callSmarthome("https://smart.test/api/leadForm/", ""), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BI_ENDPOINTS conserva la whitelist de endpoints permitidos", () => {
  assert.equal(BI_ENDPOINTS.includes("getDigitalRecords"), true);
  assert.equal(BI_ENDPOINTS.includes("getProspectDetail"), true);
  assert.equal(BI_ENDPOINTS.includes("usuarios" as (typeof BI_ENDPOINTS)[number]), false);
});
