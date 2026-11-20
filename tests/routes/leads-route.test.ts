import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { NextRequest } from "next/server";

let capturedLead: Record<string, unknown> | null = null;
mock.module("@/lib/smarthome/client", {
  namedExports: {
    addLead: async (lead: Record<string, unknown>) => {
      capturedLead = lead;
      return { leadId: "lead-1" };
    },
    SmarthomeError: class extends Error {},
  },
});

let postLead: typeof import("@/app/api/leads/route").POST | undefined;

async function routePost() {
  postLead ??= (await import("@/app/api/leads/route")).POST;
  return postLead;
}

const leadBody = {
  first_name: "Ana",
  last_name: "Giraldo",
  email: "ana@example.com",
  mobile_number: "+573001112233",
  origin: "web",
  projectCode: "3e7aa5be",
};

function request(body: unknown): NextRequest {
  return new NextRequest("https://app.test/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/leads rechaza JSON inválido y payloads incompletos", async () => {
  const invalidJson = new NextRequest("https://app.test/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const invalidResponse = await (await routePost())(invalidJson);
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), { error: "JSON inválido" });

  const missingProject = await (await routePost())(request({ ...leadBody, projectCode: "no-existe" }));
  assert.equal(missingProject.status, 400);
  assert.deepEqual(await missingProject.json(), { error: "Falta projectId/projectCode/projectName válido" });
});

test("POST /api/leads envía el lead validado y devuelve la respuesta de SmartHome", async () => {
  const response = await (await routePost())(request(leadBody));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, result: { leadId: "lead-1" } });
  assert.equal(capturedLead?.projectId, "f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW");
  assert.equal(capturedLead?.comment, "Lead web. Habeas Data: SI.");
});

