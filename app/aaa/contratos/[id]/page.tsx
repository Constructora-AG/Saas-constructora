import { redirect } from "next/navigation";
import { rutaModuloContrato } from "@/lib/aaa/rutasContrato";
import { esModuloBase } from "@/lib/transporte/constants";
import { ContratoAppClient } from "../ContratoAppClient";
import { exigirModuloAaa } from "../../_auth";

export const metadata = {
  title: "Contrato — AG Constructora",
};

export const dynamic = "force-dynamic";

// Módulo de un contrato creado desde la app: mismo motor que Contrato de
// Alquiler con su propio espacio de datos ("<id>:" en transporte_kv).
export default async function ContratoAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Contrato creado en la app que pasó a ser módulo propio (Recolección): se abre en su ruta.
  if (esModuloBase(id)) redirect(rutaModuloContrato(id));
  await exigirModuloAaa("contratos");
  return <ContratoAppClient id={id} />;
}
