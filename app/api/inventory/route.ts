import { NextRequest, NextResponse } from "next/server";
import { rest, SmarthomeError } from "@/lib/smarthome/client";

// GET /api/inventory?projectCode=3e7aa5be   -> unidades de un proyecto
// GET /api/inventory                         -> lista de proyectos
export async function GET(req: NextRequest) {
  const projectCode = req.nextUrl.searchParams.get("projectCode");
  try {
    const data = projectCode
      ? await rest.getUnits(projectCode)
      : await rest.getProjects();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SmarthomeError) {
      return NextResponse.json(
        { error: err.message, detail: err.body },
        { status: err.status || 502 },
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
