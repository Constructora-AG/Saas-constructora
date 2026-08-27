import { NextRequest, NextResponse } from "next/server";
import { bi } from "@/lib/smarthome/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canonicalAsesor, esVendedorReal } from "@/lib/smarthome/asesores";
import { PROJECTS } from "@/lib/smarthome/projects";

const ALLOWED = new Set(PROJECTS.map((p) => p.name.trim().toLowerCase()));
const permitido = (proyecto: unknown) => ALLOWED.has((proyecto ?? "").toString().trim().toLowerCase());

export const maxDuration = 300;

// POST/GET /api/vendedores/sync?secret=...
// Refresca el espejo de prospectos y contactos de Smarthome hacia Supabase,
// normalizando el nombre del asesor. Base del reporte de vendedores.
async function handler(req: NextRequest) {
  const secret = process.env.CARTERA_SYNC_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const auth =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("secret");
  if (secret && !isVercelCron && auth !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const errors: string[] = [];
  let prospectos = 0;
  let contactos = 0;

  // ── Prospectos (getProspectDetail, todas las páginas) ──────────────────────
  try {
    const detail = await bi.prospectDetail({ all: true, createdDate: "2015-01-01" });
    const rows = detail.filter((r) => permitido(r.Proyecto)).map((r) => {
      const etapa = (r.Etapa_del_Ciclo ?? "").toString().trim();
      return {
        prospect_id: r.ProspectId,
        asesor: esVendedorReal(r.Asesor) ? canonicalAsesor(r.Asesor) : "",
        asesor_raw: r.Asesor ?? "",
        proyecto: (r.Proyecto ?? "").toString().trim(),
        etapa,
        ciclo: (r.Ciclo_de_Venta ?? "").toString().trim(),
        valor: r.Valor_Ofertado ?? 0,
        celular: r.Celular ?? "",
        email: r.Email ?? "",
        fecha_creacion: r.Fecha_de_Creacion || null,
        es_venta: /^compra/i.test(etapa),
        synced_at: new Date().toISOString(),
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supa.from("sh_prospectos").upsert(rows.slice(i, i + 500), { onConflict: "prospect_id" });
      if (error) errors.push(`prospectos: ${error.message}`);
      else prospectos += Math.min(500, rows.length - i);
    }
  } catch (e) {
    errors.push(`prospectDetail: ${String(e)}`);
  }

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

  return NextResponse.json({ ok: true, prospectos, contactos, errores: errors.slice(0, 20) });
}

export const GET = handler;
export const POST = handler;
