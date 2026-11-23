import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";
import { exigirAlgunModuloAaa } from "../../_auth";

export const metadata = { title: "Prefacturas · Otro Sí / Emergencia — AG Constructora" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAlgunModuloAaa(["aaa", "emergencia"]);
  const f = FICHA_MODULO.emergencia;
  return <PrefacturasContratoPage contrato="emergencia" nombre={f.nombre} numero={f.numero} />;
}
