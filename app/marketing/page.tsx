import { supabaseConfigured } from "@/lib/demo";
import { PROJECTS } from "@/lib/smarthome/projects";
import { MarketingClient } from "./MarketingClient";
import { IconInfo } from "../icons";

export const dynamic = "force-dynamic";

export default function MarketingPage() {
  const configured = supabaseConfigured();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Marketing y gestión de leads</h1>
        <p className="page-sub">
          Qué anuncio trae los leads que sí convierten, cómo avanza el embudo y cómo gestiona cada asesor sus leads.
          Espejo de Smarthome (registros digitales y prospectos), actualizable a demanda.
        </p>
      </div>
      {!configured ? (
        <div className="info-bar"><IconInfo /><div>Conecta Supabase y aplica <code>supabase/marketing.sql</code> para ver este módulo.</div></div>
      ) : (
        <MarketingClient proyectos={PROJECTS.map((p) => p.name)} />
      )}
    </>
  );
}
