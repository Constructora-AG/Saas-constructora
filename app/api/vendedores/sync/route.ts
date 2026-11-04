import { NextRequest, NextResponse } from "next/server";
import { syncAutorizado } from "@/lib/sync/auth";
import { bi } from "@/lib/smarthome/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canonicalAsesor, esVendedorReal } from "@/lib/smarthome/asesores";
import { PROJECTS } from "@/lib/smarthome/projects";

const ALLOWED = new Set(PROJECTS.map((p) => p.name.trim().toLowerCase()));
const permitido = (proyecto: unknown) => ALLOWED.has((proyecto ?? "").toString().trim().toLowerCase());

export const maxDuration = 300;

// POST/GET /api/vendedores/sync?secret=...
// Refresca el espejo de contactos de Smarthome hacia Supabase, normalizando el nombre
// del asesor. Los prospectos (sh_prospectos) los sincroniza /api/marketing/sync.
async function handler(req: NextRequest) {
  if (!syncAutorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supa = supabaseAdmin();
  const errors: string[] = [];
  let contactos = 0;

  // ── Contactos digitales (getDigitalRecords) ────────────────────────────────
  try {
    const digital = await bi.digitalRecords();
    const rows = digital.filter((r: any) => permitido(r.Project)).map((r: any) => ({
      id: String(r.Id ?? `${r.ProspectId}-${r.CreationDate}`),
      asesor: esVendedorReal(r.Owner) ? canonicalAsesor(r.Owner) : "",
      asesor_raw: r.Owner ?? "",
      proyecto: (r.Project ?? "").toString().trim(),
      canal: (r.LocationSource ?? "").toString().trim(),
      prospect_id: r.ProspectId ?? null,
      fecha: r.CreationDate || r.FirstActionDate || null,
      synced_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supa.from("sh_contactos").upsert(rows.slice(i, i + 500), { onConflict: "id" });
      if (error) errors.push(`contactos: ${error.message}`);
      else contactos += Math.min(500, rows.length - i);
    }
  } catch (e) {
    errors.push(`digitalRecords: ${String(e)}`);
  }

  return NextResponse.json({ ok: true, contactos, errores: errors.slice(0, 20) });
}

export const GET = handler;
export const POST = handler;
