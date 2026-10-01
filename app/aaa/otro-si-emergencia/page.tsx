import { TransporteClient } from "../transporte/TransporteClient";

export const metadata = {
  title: "Otro Sí / Emergencia — AG Constructora",
};

export const dynamic = "force-dynamic";

// Otro Sí / Emergencia (Proyecto Triple A): mismo motor que Contrato de Alquiler
// (registros, tarifario, reportes, flota, personal, administración) con su
// propio espacio de datos ("emergencia:" en transporte_kv). Nunca se mezcla con
// Contrato de Alquiler ni con Transporte AAA.
export default function OtroSiEmergenciaPage() {
  return (
    <TransporteClient
      ns="emergencia"
      titulo="Otro Sí / Emergencia"
      subtitulo="Contrato N° 2026-060 — transporte de residuos especiales no peligrosos y sólidos ordinarios no aprovechables (contratación directa por emergencia) con Triple A / Anaya Giraldo: registros, tarifario, reportes y avance."
    />
  );
}
