import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";
import { exigirAlgunModuloAaa } from "../../_auth";

export const metadata = { title: "Prefacturas · Contrato de Alquiler — AG Constructora" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAlgunModuloAaa(["aaa", "alquiler"]);
  const f = FICHA_MODULO.alquiler;
  return <PrefacturasContratoPage contrato="alquiler" nombre={f.nombre} numero={f.numero} />;
}
