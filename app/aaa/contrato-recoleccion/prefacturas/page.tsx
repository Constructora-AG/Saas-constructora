import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";
import { exigirAlgunModuloAaa } from "../../_auth";

export const metadata = { title: "Prefacturas · Contrato de Recolección — AG Constructora" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAlgunModuloAaa(["aaa", "recoleccion"]);
  const f = FICHA_MODULO.recoleccion;
  return <PrefacturasContratoPage contrato="recoleccion" nombre={f.nombre} numero={f.numero} />;
}
