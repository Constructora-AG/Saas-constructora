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
    return NextResponse.json({ leads: [], prospectos: [], compradores: [], ventas: [], inversion: [], ultimoSync: null, syncDetalle: null } satisfies MarketingData);
  }
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const supa = supabaseAdmin();

  try {
    const [leads, prospectos, compradores, { data: inv }, { data: sync }, { data: cartera }] = await Promise.all([
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
      supa.from("cartera").select("prospect_id, project_name, module, total_valor, cliente"),
    ]);
    // ── Ventas reales (cartera) → fuente de verdad. Se cruzan con prospectos y leads ──
    const filasCartera = (cartera ?? []) as Array<{ prospect_id: string | null; project_name: string; module: string; total_valor: number | null; cliente: string | null }>;
    const idsCartera = [...new Set(filasCartera.map((c) => c.prospect_id).filter((x): x is string => !!x))];
    const [{ data: prosVenta }, { data: leadsVenta }, { data: abonos }] = idsCartera.length
      ? await Promise.all([
          supa.from("sh_prospectos").select("prospect_id, digital, fecha_creacion, fecha_cierre").in("prospect_id", idsCartera),
          supa.from("mk_leads").select("prospect_id").in("prospect_id", idsCartera),
          supa.from("sh_abonos").select("prospect_id, fecha").in("prospect_id", idsCartera).order("fecha", { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    const infoPros = new Map((prosVenta ?? []).map((p) => [p.prospect_id as string, p as { digital: boolean | null; fecha_creacion: string | null; fecha_cierre: string | null }]));
    const primerAbono = new Map<string, string>();
    (abonos ?? []).forEach((a) => { const id = a.prospect_id as string; if (id && !primerAbono.has(id)) primerAbono.set(id, String(a.fecha)); });
    const conLead = new Set((leadsVenta ?? []).map((l) => l.prospect_id as string));
    const setVenta = new Set(idsCartera);
    const ventas: MarketingData["ventas"] = filasCartera.map((c) => ({
      prospect_id: c.prospect_id, project_name: c.project_name, module: c.module, total_valor: c.total_valor,
      digital: !!(c.prospect_id && infoPros.get(c.prospect_id)?.digital), lead: !!(c.prospect_id && conLead.has(c.prospect_id)),
      fecha_creacion: (c.prospect_id && infoPros.get(c.prospect_id)?.fecha_creacion) || null,
      fecha_venta: (c.prospect_id && (infoPros.get(c.prospect_id)?.fecha_cierre || primerAbono.get(c.prospect_id))) || null,
      cliente: c.cliente ?? null,
    }));
    const marcar = <T extends { prospect_id: string | null; es_venta?: boolean | null }>(arr: T[]) =>
      arr.map((x) => (x.prospect_id && setVenta.has(x.prospect_id) ? { ...x, es_venta: true } : x));
    const body: MarketingData = {
      leads: marcar(leads as MarketingData["leads"]),
      prospectos: marcar(prospectos as MarketingData["prospectos"]),
      compradores: marcar(compradores as MarketingData["prospectos"]),
      ventas,
      inversion: (inv ?? []) as MarketingData["inversion"],
      ultimoSync: (sync?.ultimo_ok as string) ?? null,
      syncDetalle: (sync?.detalle as Record<string, unknown>) ?? null,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
