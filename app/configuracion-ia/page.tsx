import { ConfiguracionIaClient } from "./ConfiguracionIaClient";

export const dynamic = "force-dynamic";

// Configuración del proveedor de IA (clave de API, modelo). Solo Gerencia.
export default function ConfiguracionIaPage() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Configuración IA</h1>
        <p className="page-sub">Proveedor, modelo y clave de la API que usa el Asistente. La clave se guarda cifrada en el servidor y nunca se muestra completa. Solo Gerencia.</p>
      </div>
      <ConfiguracionIaClient />
    </>
  );
}
