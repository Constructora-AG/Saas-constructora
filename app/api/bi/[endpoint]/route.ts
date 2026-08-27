import { NextRequest, NextResponse } from "next/server";
import { bi, BI_ENDPOINTS, type BiEndpoint, SmarthomeError } from "@/lib/smarthome/client";

// GET /api/bi/getProjectSummary
// GET /api/bi/getProspectDetail?page=1&records=1000&createdDate=2023-01-01
// La userKey NUNCA se expone al cliente: vive en el servidor (.env.local).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await params;

  if (!BI_ENDPOINTS.includes(endpoint as BiEndpoint)) {
    return NextResponse.json(
      { error: `Endpoint BI no permitido: ${endpoint}`, allowed: BI_ENDPOINTS },
      { status: 400 },
    );
  }

  const query = Object.fromEntries(req.nextUrl.searchParams.entries());

  try {
    const data = await bi.raw(endpoint, Object.keys(query).length ? query : undefined);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SmarthomeError) {
      return NextResponse.json(
        { error: err.message, status: err.status, detail: err.body },
        { status: err.status === 0 ? 502 : err.status },
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
