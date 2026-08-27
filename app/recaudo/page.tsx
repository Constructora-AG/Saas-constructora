import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo";
import { RecaudoClient } from "./RecaudoClient";
import { IconInfo } from "../icons";

export const dynamic = "force-dynamic";

export default async function RecaudoPage() {
  const configured = supabaseConfigured();
  let proyectos: string[] = [];

  if (configured) {
    const supa = supabaseAdmin();
    const { data } = await supa.rpc("recaudo_por_proyecto", { desde: null, hasta: null });
    proyectos = (data ?? []).map((r: any) => r.proyecto).filter(Boolean);
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Recaudo por proyecto</h1>
        <p className="page-sub">Cuánto se debe recaudar en el período y cómo va el recaudo a la fecha, por proyecto. Datos del plan de pagos de Smarthome.</p>
      </div>
      {!configured ? (
        <div className="info-bar"><IconInfo /><div>Conecta Supabase para ver el recaudo.</div></div>
      ) : (
        <RecaudoClient proyectos={proyectos} />
      )}
    </>
  );
}
