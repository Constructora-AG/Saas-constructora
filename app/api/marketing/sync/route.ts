import { NextRequest, NextResponse } from "next/server";
import { bi } from "@/lib/smarthome/client";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { PROJECTS } from "@/lib/smarthome/projects";
import { mapDigitalRecord, mapProspectDetail } from "@/lib/marketing/smarthome";
import { cachearMiniaturas } from "@/lib/marketing/miniaturas";

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
  // ?estado=1 → solo devuelve el último estado registrado (lo usa la UI si se pierde la conexión)
  if (req.nextUrl.searchParams.get("estado")) {
    const { data } = await supa.from("mk_sync_estado").select("ultimo_ok, detalle").eq("clave", "marketing").maybeSingle();
    return NextResponse.json({ ultimo_ok: data?.ultimo_ok ?? null, detalle: data?.detalle ?? null });
  }
  // ?miniaturas=1 → solo guarda en Storage las miniaturas de anuncios aún vigentes
  if (req.nextUrl.searchParams.get("miniaturas")) {
    return NextResponse.json(await cachearMiniaturas(supa));
  }
  const errores: string[] = [];
  const inicio = Date.now();
  let leads = 0;
  let prospectos = 0;
  let miniaturas: { cacheadas: number; caducadas: number; reutilizadas: number } | null = null;

  // El estado se guarda al terminar cada fase, no solo al final: si la función se
  // queda sin tiempo en una fase posterior, lo ya sincronizado queda registrado y
  // la UI muestra el avance real en vez de un error.
  const guardarEstado = async () => {
    const detalle = { leads, prospectos, miniaturas, errores: errores.slice(0, 10), segundos: Math.round((Date.now() - inicio) / 1000) };
    if (leads || prospectos) {
      await supa.from("mk_sync_estado").upsert({ clave: "marketing", ultimo_ok: new Date().toISOString(), detalle }, { onConflict: "clave" });
    }
    return detalle;
  };

  const subir = async (tabla: string, onConflict: string, rows: Record<string, unknown>[]): Promise<number> => {
    let ok = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const lote = rows.slice(i, i + 500);
      const { error } = await supa.from(tabla).upsert(lote, { onConflict });
      if (error) errores.push(`${tabla}: ${error.message}`);
      else ok += lote.length;
    }
    return ok;
  };

  // Las fases van EN SERIE: Smarthome responde mucho más lento con peticiones
  // simultáneas (medido: 246 s en paralelo vs 76 s en serie).
  try {
    const digital = await bi.digitalRecords();
    leads = await subir("mk_leads", "id", digital.filter((r) => permitido(r.Project)).map(mapDigitalRecord));
  } catch (e) {
    errores.push(`digitalRecords: ${String(e)}`);
  }
  await guardarEstado();

  // ── Prospectos enriquecidos (getProspectDetail, todas las páginas) ─────────
  // Página a página: el histórico son ~68.000 registros y acumularlos enteros en
  // memoria antes de subirlos hacía que la función muriera sin escribir nada.
  try {
    for await (const pagina of bi.prospectDetailPages({ createdDate: "2015-01-01" })) {
      const rows = (pagina as unknown as Record<string, unknown>[]).filter((r) => permitido(r.Proyecto)).map(mapProspectDetail);
      prospectos += await subir("sh_prospectos", "prospect_id", rows);
    }
  } catch (e) {
    errores.push(`prospectDetail: ${String(e)}`);
  }
  await guardarEstado();

  // ── Miniaturas de anuncios → Storage (los enlaces de fbcdn caducan en días) ──
  // Con presupuesto de tiempo: es lo accesorio del sync y no puede agotar la
  // duración máxima de la función; lo que falte se completa en la siguiente pasada.
  try {
    miniaturas = await cachearMiniaturas(supa, Math.max(0, maxDuration * 1000 - 45_000 - (Date.now() - inicio)));
  } catch (e) {
    errores.push(`miniaturas: ${String(e)}`);
  }

  const detalle = await guardarEstado();
  return NextResponse.json({ ok: errores.length === 0, ...detalle });
}

export const GET = handler;
export const POST = handler;
