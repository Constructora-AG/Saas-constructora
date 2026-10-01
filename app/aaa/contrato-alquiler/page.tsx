import { TransporteClient } from "../transporte/TransporteClient";

export const metadata = {
  title: "Contrato de Alquiler — AG Constructora",
};

export const dynamic = "force-dynamic";

// Contrato de Alquiler (Proyecto Triple A): mismo motor que Transporte AAA
// (registros, tarifario, reportes, flota, personal, administración) con su
// propio espacio de datos ("alquiler:" en transporte_kv). Se irá adaptando.
export default function ContratoAlquilerPage() {
  return (
    <TransporteClient
      ns="alquiler"
      titulo="Contrato de Alquiler"
      subtitulo="Contrato N° 2026-003 — alquiler de equipos y/o maquinaria pesada a todo costo (Grupo 1) con Triple A / Anaya Giraldo: registros, tarifario del contrato, reportes y avance."
    />
  );
}
