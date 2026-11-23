import { ContratosClient } from "./ContratosClient";
import { exigirModuloAaa } from "../_auth";

export const metadata = {
  title: "Contratos — AG Constructora",
};

export const dynamic = "force-dynamic";

// Proyecto Triple A → Contratos: crear un contrato nuevo desde la app genera su
// módulo (registros, tarifario, reportes, administración) con datos propios.
export default async function ContratosPage() {
  await exigirModuloAaa("contratos");
  return <ContratosClient />;
}
