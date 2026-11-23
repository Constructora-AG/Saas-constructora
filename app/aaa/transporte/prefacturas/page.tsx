import { PrefacturasContratoPage } from "../../PrefacturasContratoPage";
import { FICHA_MODULO } from "@/lib/transporte/constants";

export const metadata = { title: "Prefacturas · Transporte AAA — AG Constructora" };
export const dynamic = "force-dynamic";

export default function Page() {
  const f = FICHA_MODULO.transporte;
  return <PrefacturasContratoPage contrato="transporte" nombre={f.nombre} numero={f.numero} />;
}
