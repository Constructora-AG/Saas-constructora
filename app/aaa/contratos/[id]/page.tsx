import { ContratoAppClient } from "../ContratoAppClient";
import { exigirModuloAaa } from "../../_auth";

export const metadata = {
  title: "Contrato — AG Constructora",
};

export const dynamic = "force-dynamic";

// Módulo de un contrato creado desde la app: mismo motor que Contrato de
// Alquiler con su propio espacio de datos ("<id>:" en transporte_kv).
export default async function ContratoAppPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirModuloAaa("contratos");
  const { id } = await params;
  return <ContratoAppClient id={id} />;
}
