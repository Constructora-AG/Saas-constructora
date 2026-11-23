import Link from "next/link";
import { redirect } from "next/navigation";
import { rutaPrefacturasContrato } from "@/lib/aaa/rutasContrato";
import { esModuloBase } from "@/lib/transporte/constants";
import { PrefacturasContratoPage } from "../../../PrefacturasContratoPage";
import { cargarContratosServidor } from "@/lib/aaa/prefacturasServidor";
import { exigirAlgunModuloAaa } from "../../../_auth";

export const metadata = { title: "Prefacturas del contrato — AG Constructora" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Contrato creado en la app que pasó a ser módulo propio (Recolección): se abre en su ruta.
  if (esModuloBase(id)) redirect(rutaPrefacturasContrato(id));
  await exigirAlgunModuloAaa(["aaa", "contratos"]);
  const c = (await cargarContratosServidor()).find((x) => x.id === id);
  if (!c) return <div className="info-bar">El contrato «{id}» no existe. <Link href="/aaa/contratos">Ver contratos</Link></div>;
  return <PrefacturasContratoPage contrato={c.id} nombre={c.nombre} numero={c.numero ? `N° ${c.numero}` : undefined} />;
}
