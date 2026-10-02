import { headers } from "next/headers";
import { ConectorMcpClient } from "./ConectorMcpClient";

export const dynamic = "force-dynamic";

// Guía para conectar Claude al servidor MCP de solo lectura (/api/mcp). Solo Gerencia.
// El token nunca se muestra: la página solo informa si MCP_TOKEN está configurado.
export default async function ConectorMcpPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "saas-constructora-ten.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Conector Claude (MCP)</h1>
        <p className="page-sub">Cómo conectar Claude (claude.ai, Claude Desktop o Claude Code) para que consulte en vivo los datos de la plataforma. Solo lectura: no puede crear, cambiar ni borrar nada. Solo Gerencia.</p>
      </div>
      <ConectorMcpClient endpoint={`${proto}://${host}/api/mcp`} activo={Boolean(process.env.MCP_TOKEN)} />
    </>
  );
}
