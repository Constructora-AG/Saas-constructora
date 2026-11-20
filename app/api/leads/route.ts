import { NextRequest, NextResponse } from "next/server";
import { addLead, SmarthomeError } from "@/lib/smarthome/client";
import { buildLeadInput } from "@/lib/smarthome/leads";

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

  const built = buildLeadInput(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  try {
    const result = await addLead(built.lead);
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
