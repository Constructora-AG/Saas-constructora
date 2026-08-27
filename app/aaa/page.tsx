import { CORTE } from "@/lib/aaa/compute";
import type { PrefacturaRow } from "@/lib/aaa/catalogo";
import { DEMO_PREFACTURAS, supabaseConfigured } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/server";
import { IconInfo } from "../icons";
import { AaaClient } from "./AaaClient";

export const dynamic = "force-dynamic";

export default async function AaaPage() {
  const demo = !supabaseConfigured();
  let prefacturas: PrefacturaRow[] = [];
  let loadError: string | null = null;

  if (demo) {
    prefacturas = DEMO_PREFACTURAS as PrefacturaRow[];
  } else {
    const supa = supabaseAdmin();
    const { data, error } = await supa
      .from("aaa_prefacturas")
      .select("*")
      .order("fecha_generacion", { ascending: false });
    if (error) loadError = error.message;
    prefacturas = (data ?? []) as PrefacturaRow[];
  }

  const corte = new Date(CORTE.fecha_corte + "T00:00:00").toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Proyecto Triple A</h1>
        <p className="page-sub">
          Control de costos de los contratos con Triple A de B/Q: presupuesto contractual vs. costo interno de AG
          (consumido), facturado y prefacturas. Corte al {corte}.
        </p>
      </div>

      <div className="info-bar">
        <IconInfo />
        <div>
          <b>Datos del corte manual de subgerencia</b> — consumido y facturado provienen de los centros de costos
          <b> AAA</b> y <b>AAA facturación</b> de Herpro; las prefacturas se registran aquí mismo, en la pestaña
          Prefacturas. La sincronización automática con Herpro queda pendiente de los accesos.
        </div>
      </div>

      {loadError && (
        <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
          <IconInfo />
          <div>
            <b>No se pudieron cargar las prefacturas.</b>
            <div style={{ marginTop: 2 }}>{loadError} — ¿ya ejecutaste <code>supabase/aaa_prefacturas.sql</code> en Supabase?</div>
          </div>
        </div>
      )}

      <AaaClient data={CORTE} prefacturas={prefacturas} demo={demo} />
    </>
  );
}
