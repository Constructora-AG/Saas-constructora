import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo";
import type { MarketingData } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const LEAD_COLS =
  "id, prospect_id, proyecto, canal, medio, campana, ad_id, ad_titulo, ad_tipo, ad_url, ad_miniatura, formulario, asesor, fecha_creacion, primera_accion, horas_primera_accion, ciclo, etapa, probabilidad, es_venta, es_unico, cliente_existente, fecha_cierre, credito_aprobado, empleo, reportado, capacidad_pago, motivacion, tiempo_compra";
const PROSP_COLS =
  "prospect_id, nombre, asesor, proyecto, etapa, ciclo, valor, fecha_creacion, es_venta, genero, edad, ocupacion, profesion, cargo, barrio, ciudad, estado_civil, fuente, probabilidad, fecha_cierre, seguimiento, estado_credito, digital, acciones, acciones_detalle, reportado";

// Trae todas las filas paginando (PostgREST limita a 1000 por defecto).
async function todas<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// GET /api/marketing/data?desde=ISO&hasta=ISO
// Devuelve leads y prospectos (por fecha de creación) + inversión + estado del sync.
export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ leads: [], prospectos: [], compradores: [], inversion: [], ultimoSync: null, syncDetalle: null } satisfies MarketingData);
  }
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const supa = supabaseAdmin();

  try {
    const [leads, prospectos, compradores, { data: inv }, { data: sync }] = await Promise.all([
      todas((a, b) => {
        let q = supa.from("mk_leads").select(LEAD_COLS).order("fecha_creacion", { ascending: false }).range(a, b);
        if (desde) q = q.gte("fecha_creacion", desde);
        if (hasta) q = q.lte("fecha_creacion", hasta);
        return q;
      }),
      todas((a, b) => {
        let q = supa.from("sh_prospectos").select(PROSP_COLS).order("fecha_creacion", { ascending: false }).range(a, b);
        if (desde) q = q.gte("fecha_creacion", desde);
        if (hasta) q = q.lte("fecha_creacion", hasta);
        return q;
      }),
      todas((a, b) => supa.from("sh_prospectos").select(PROSP_COLS).eq("es_venta", true).order("fecha_creacion", { ascending: false }).range(a, b)),
      supa.from("mk_inversion").select("id, mes, proyecto, canal, monto, nota").order("mes", { ascending: false }),
      supa.from("mk_sync_estado").select("ultimo_ok, detalle").eq("clave", "marketing").maybeSingle(),
    ]);
    const body: MarketingData = {
      leads: leads as MarketingData["leads"],
      prospectos: prospectos as MarketingData["prospectos"],
      compradores: compradores as MarketingData["prospectos"],
      inversion: (inv ?? []) as MarketingData["inversion"],
      ultimoSync: (sync?.ultimo_ok as string) ?? null,
      syncDetalle: (sync?.detalle as Record<string, unknown>) ?? null,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
