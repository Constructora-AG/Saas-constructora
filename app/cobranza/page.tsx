import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo";
import { BitacoraClient } from "./BitacoraClient";
import { IconInfo } from "../icons";

export const dynamic = "force-dynamic";

export default async function CobranzaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente: clienteInicial = "" } = await searchParams;
  const configured = supabaseConfigured();
  let usuarios: string[] = [];
  let clientes: string[] = [];

  if (configured) {
    const supa = supabaseAdmin();
    const [{ data: us }, { data: cs }] = await Promise.all([
      supa.rpc("bitacora_usuarios"),
      supa.from("cartera").select("cliente").order("cliente"),
    ]);
    usuarios = (us ?? []).map((r: any) => r.usuario);
    clientes = [...new Set((cs ?? []).map((r: any) => r.cliente).filter(Boolean))];
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Bitácora de cobranza</h1>
        <p className="page-sub">Gestión real de Smarthome: a qué clientes se contactó, envíos de WhatsApp, recaudos y notas de seguimiento. Filtra por gestor, tipo, fecha y texto.</p>
      </div>
      {!configured ? (
        <div className="info-bar"><IconInfo /><div>Conecta Supabase para ver la bitácora.</div></div>
      ) : (
        <BitacoraClient usuarios={usuarios} clientes={clientes} clienteInicial={clienteInicial} />
      )}
    </>
  );
}
