import { supabaseAdmin } from "@/lib/supabase/server";
import { DEMO_CARTERA, DEMO_COBRADORES, supabaseConfigured } from "@/lib/demo";
import { CarteraClient, type CarteraRow, type Cobrador } from "./CarteraClient";
import { IconInfo } from "../icons";

export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  const demo = !supabaseConfigured();
  let rows: CarteraRow[];
  let cobradores: Cobrador[];

  if (demo) {
    rows = DEMO_CARTERA as CarteraRow[];
    cobradores = DEMO_COBRADORES;
  } else {
    const supa = supabaseAdmin();
    const [{ data: cartera }, { data: gestion }, { data: cobs }, { data: roles }] = await Promise.all([
      supa.from("cartera").select("*").order("dias_mora", { ascending: false }),
      supa.from("cartera_gestion").select("*"),
      supa.from("cobradores").select("id, nombre").eq("activo", true),
      supa.from("usuarios_rol").select("nombre").in("rol", ["cartera", "administracion"]),
    ]);
    const gMap = new Map((gestion ?? []).map((g: any) => [g.prospect_id, g]));
    rows = (cartera ?? []).map((c: any) => ({
      ...c,
      estado: gMap.get(c.prospect_id)?.estado ?? "sin_gestion",
      ultima_gestion_at: gMap.get(c.prospect_id)?.ultima_gestion_at ?? null,
      ultimo_canal: gMap.get(c.prospect_id)?.ultimo_canal ?? null,
    }));
    // Solo el equipo de cartera/cobranza puede registrar gestiones (Yomaira, etc.).
    const carteraNombres = new Set((roles ?? []).map((r: any) => r.nombre));
    const all = (cobs ?? []) as Cobrador[];
    const soloCartera = all.filter((c) => carteraNombres.has(c.nombre));
    cobradores = soloCartera.length ? soloCartera : all;
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Control de cartera</h1>
        <p className="page-sub">Consulta qué clientes están retrasados y quiénes al día. Filtra por proyecto, nivel de mora, vencimiento y busca por nombre.</p>
      </div>

      {demo && (
        <div className="info-bar">
          <IconInfo />
          <div><b>Modo demostración</b> — datos de ejemplo. Al conectar Supabase y Smarthome verás tus clientes reales.</div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="table-wrap" style={{ padding: 24 }}>
          <p style={{ marginTop: 0 }}>Aún no hay cartera cargada. Sincroniza desde Smarthome:</p>
          <pre style={{ background: "var(--surface-2)", border: "1px solid var(--border)", padding: 12, borderRadius: 8, overflowX: "auto", fontSize: 12.5 }}>
{`curl -X POST "http://localhost:3000/api/cartera/sync?secret=TU_CARTERA_SYNC_SECRET"`}
          </pre>
        </div>
      ) : (
        <CarteraClient initialRows={rows} cobradores={cobradores} demo={demo} />
      )}
    </>
  );
}
