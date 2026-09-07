import { AsistenteClient } from "./AsistenteClient";

export const dynamic = "force-dynamic";

// Asistente IA: chat que consulta (solo lectura) la información de la
// plataforma según el alcance del rol del usuario y redacta informes.
export default function AsistentePage() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Asistente IA</h1>
        <p className="page-sub">Pregunta en lenguaje natural por cartera, recaudo, ventas, marketing, Triple A o prefacturas y pide informes. Responde solo con datos reales de la plataforma y únicamente de los módulos a los que tienes acceso.</p>
      </div>
      <AsistenteClient />
    </>
  );
}
