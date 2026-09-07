import { AsistenteClient } from "./AsistenteClient";

export const dynamic = "force-dynamic";

// Asistente de gerencia: chat con IA que consulta (solo lectura) toda la
// información de la plataforma y redacta informes. Solo Gerencia.
export default function AsistentePage() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Asistente de gerencia</h1>
        <p className="page-sub">Pregunta en lenguaje natural por cartera, recaudo, ventas, marketing, Triple A o prefacturas y pide informes. Responde solo con datos reales de la plataforma. Solo Gerencia.</p>
      </div>
      <AsistenteClient />
    </>
  );
}
