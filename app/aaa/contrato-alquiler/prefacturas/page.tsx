import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";

export const metadata = { title: "Prefacturas · Contrato de Alquiler — AG Constructora" };
export const dynamic = "force-dynamic";

export default function Page() {
  const f = FICHA_MODULO.alquiler;
  return <PrefacturasContratoPage contrato="alquiler" nombre={f.nombre} numero={f.numero} />;
}
