import { TransporteClient } from "../transporte/TransporteClient";
import { exigirModuloAaa } from "../_auth";

export const metadata = {
  title: "Contrato de Recolección — AG Constructora",
};

export const dynamic = "force-dynamic";

// Contrato de Recolección (Proyecto Triple A): mismo motor que Contrato de
// Alquiler, con su propio espacio de datos ("recoleccion:" en transporte_kv).
// Los servicios se registran a mano desde la Planilla de Despacho de Equipos
// (horómetro, ruta, actividad) y se cobran por horas efectivas × valor hora
// del tarifario (volqueta dobletroque o sencilla × tipo de servicio).
export default async function ContratoRecoleccionPage() {
  await exigirModuloAaa("recoleccion");
  return (
    <TransporteClient
      ns="recoleccion"
      titulo="Contrato de Recolección"
      subtitulo="Contrato N° CW2239410 — recolección, transporte y disposición final de residuos sólidos no compactables con volquetas dobletroque y sencillas (Grupo 3) con Triple A / Anaya Giraldo: registros por horómetro, tarifario del contrato, reportes y avance."
    />
  );
}
