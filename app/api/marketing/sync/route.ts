import { NextRequest, NextResponse } from "next/server";
import { bi } from "@/lib/smarthome/client";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { PROJECTS } from "@/lib/smarthome/projects";
import { mapDigitalRecord, mapProspectDetail } from "@/lib/marketing/smarthome";

const ALLOWED = new Set(PROJECTS.map((p) => p.name.trim().toLowerCase()));
const permitido = (proyecto: unknown) => ALLOWED.has((proyecto ?? "").toString().trim().toLowerCase());

export const maxDuration = 300;

// POST/GET /api/marketing/sync
// Refresca el espejo de leads digitales (mk_leads) y enriquece sh_prospectos con
// demografía y estado de seguimiento. Autorizado por: cron de Vercel, secret
// (CARTERA_SYNC_SECRET) o un usuario con sesión (botón "Actualizar" en la UI).
async function autorizado(req: NextRequest): Promise<boolean> {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CARTERA_SYNC_SECRET;
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? req.nextUrl.searchParams.get("secret");
  if (secret && auth === secret) return true;
  const supa = await supabaseServer();
  if (!supa) return true; // modo demo (sin Supabase) — el middleware ya deja pasar
  const { data } = await supa.auth.getUser();
  return Boolean(data.user);
}

async function handler(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supa = supabaseAdmin();
  const errores: string[] = [];
  const inicio = Date.now();
  let leads = 0;
  let prospectos = 0;

  // ── Leads digitales (getDigitalRecords) ────────────────────────────────────
  try {
    const digital = await bi.digitalRecords();
    const rows = digital.filter((r) => permitido(r.Project)).map(mapDigitalRecord);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supa.from("mk_leads").upsert(rows.slice(i, i + 500), { onConflict: "id" });
      if (error) errores.push(`mk_leads: ${error.message}`);
      else leads += Math.min(500, rows.length - i);
    }
  } catch (e) {
    errores.push(`digitalRecords: ${String(e)}`);
  }

  // ── Prospectos enriquecidos (getProspectDetail, todas las páginas) ─────────
  try {
    const detail = await bi.prospectDetail({ all: true, createdDate: "2015-01-01" });
    const rows = (detail as unknown as Record<string, unknown>[]).filter((r) => permitido(r.Proyecto)).map(mapProspectDetail);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supa.from("sh_prospectos").upsert(rows.slice(i, i + 500), { onConflict: "prospect_id" });
      if (error) errores.push(`sh_prospectos: ${error.message}`);
      else prospectos += Math.min(500, rows.length - i);
    }
  } catch (e) {
    errores.push(`prospectDetail: ${String(e)}`);
  }

  const detalle = { leads, prospectos, errores: errores.slice(0, 10), segundos: Math.round((Date.now() - inicio) / 1000) };
  if (leads || prospectos) {
    await supa.from("mk_sync_estado").upsert({ clave: "marketing", ultimo_ok: new Date().toISOString(), detalle }, { onConflict: "clave" });
  }
  return NextResponse.json({ ok: errores.length === 0, ...detalle });
}

export const GET = handler;
export const POST = handler;
