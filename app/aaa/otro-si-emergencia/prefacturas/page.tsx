import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";

export const metadata = { title: "Prefacturas · Otro Sí / Emergencia — AG Constructora" };
export const dynamic = "force-dynamic";

export default function Page() {
  const f = FICHA_MODULO.emergencia;
  return <PrefacturasContratoPage contrato="emergencia" nombre={f.nombre} numero={f.numero} />;
}
