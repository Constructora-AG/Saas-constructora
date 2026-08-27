import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo";
import { mergeVendedores, type VendProspecto, type VendContacto } from "@/lib/vendedores";
import { VendedoresClient } from "./VendedoresClient";
import { IconInfo } from "../icons";

export const dynamic = "force-dynamic";

export default async function VendedoresPage() {
  const configured = supabaseConfigured();
  let initial = mergeVendedores([], []);

  if (configured) {
    const supa = supabaseAdmin();
    const [{ data: p }, { data: c }] = await Promise.all([
      supa.rpc("vend_prospectos", { desde: null, hasta: null }),
      supa.rpc("vend_contactos", { desde: null, hasta: null }),
    ]);
    initial = mergeVendedores((p ?? []) as VendProspecto[], (c ?? []) as VendContacto[]);
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Vendedores</h1>
        <p className="page-sub">Consulta cómo va cada vendedor y qué gestión ha hecho — pipeline, ventas y contactos, con datos de Smarthome. Filtra por período.</p>
      </div>
      {!configured ? (
        <div className="info-bar">
          <IconInfo />
          <div>Conecta Supabase para ver el reporte de vendedores.</div>
        </div>
      ) : (
        <VendedoresClient initial={initial} />
      )}
    </>
  );
}
