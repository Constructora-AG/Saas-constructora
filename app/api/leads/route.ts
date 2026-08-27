import { NextRequest, NextResponse } from "next/server";
import { addLead, SmarthomeError } from "@/lib/smarthome/client";
import { projectByCode, projectByName } from "@/lib/smarthome/projects";
import type { LeadInput } from "@/lib/smarthome/types";

// POST /api/leads
// Body: { first_name, last_name, email, mobile_number, origin, comment?,
//         projectCode | projectName | projectId(encriptado), locationSourceId?, fieldList? }
//
// Acepta projectCode o projectName y resuelve el ProjectId ENCRIPTADO que exige leadForm.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Resolver el projectId encriptado.
  let projectId = body.projectId as string | undefined;
  if (!projectId && typeof body.projectCode === "string") {
    projectId = projectByCode(body.projectCode)?.encryptedId;
  }
  if (!projectId && typeof body.projectName === "string") {
    projectId = projectByName(body.projectName)?.encryptedId;
  }
  if (!projectId) {
    return NextResponse.json(
      { error: "Falta projectId/projectCode/projectName válido" },
      { status: 400 },
    );
  }

  const required = ["first_name", "last_name", "email", "mobile_number", "origin"] as const;
  for (const f of required) {
    if (!body[f]) return NextResponse.json({ error: `Falta campo: ${f}` }, { status: 400 });
  }

  const lead: LeadInput = {
    first_name: String(body.first_name),
    last_name: String(body.last_name),
    email: String(body.email),
    mobile_number: String(body.mobile_number),
    origin: String(body.origin),
    comment: body.comment ? String(body.comment) : "Lead web. Habeas Data: SI.",
    projectId,
    locationSourceId: body.locationSourceId ? String(body.locationSourceId) : undefined,
    scoring: body.scoring ? String(body.scoring) : undefined,
    fieldList: Array.isArray(body.fieldList) ? (body.fieldList as LeadInput["fieldList"]) : undefined,
  };

  try {
    const result = await addLead(lead);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof SmarthomeError) {
      return NextResponse.json(
        { ok: false, error: err.message, detail: err.body },
        { status: err.status || 502 },
      );
    }
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
