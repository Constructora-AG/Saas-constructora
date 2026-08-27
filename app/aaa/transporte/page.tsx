import { TransporteClient } from "./TransporteClient";

export const metadata = {
  title: "Control Transporte AAA — AG Constructora",
};

export const dynamic = "force-dynamic";

// Módulo nativo del panel de Control de Transporte AAA (Contrato IS No. 04-2026).
// Toda la carga de datos es cliente (hook useTransporte → /api/aaa/transporte,
// tabla Supabase transporte_kv), así que el server component solo monta el shell.
export default function TransporteAaaPage() {
  return <TransporteClient />;
}
