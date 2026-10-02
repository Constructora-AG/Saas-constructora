import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ErrorHerramienta, HERRAMIENTAS, ejecutarHerramienta } from "@/lib/mcp/herramientas";

// ════════════════════════════════════════════════════════════════════
// Servidor MCP remoto de SOLO LECTURA (Model Context Protocol, transporte
// «Streamable HTTP» sin sesión: cada POST es un mensaje JSON-RPC y la
// respuesta va en JSON). Permite conectar Claude (claude.ai, Claude
// Desktop o Claude Code) a los datos de la plataforma.
//
// Autenticación: token en MCP_TOKEN (variable de entorno). Se acepta como
//   · Authorization: Bearer <token>        (Claude Code / Desktop)
//   · /api/mcp?key=<token>                 (conector personalizado de claude.ai)
// Sin MCP_TOKEN configurado el endpoint queda deshabilitado (503).
// El middleware deja pasar /api/mcp: la validación vive aquí.
// ════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVIDOR = { name: "ag-constructora-datos", title: "AG Constructora — datos (solo lectura)", version: "1.0.0" };
const INSTRUCCIONES =
  "Datos de CONSTRUCTORA ANAYA GIRALDO SAS: cartera y cobranza, recaudo, vendedores, marketing y leads, y Proyecto Triple A " +
  "(contratos, registros, tarifarios, prefacturas y facturas). Solo lectura. Llama primero a describir_datos para conocer las " +
  "tablas y las reglas de cálculo; nunca inventes cifras: toda cifra debe salir de una herramienta. Responde en español, en COP.";

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.MCP_TOKEN;
  if (!esperado) return false;
  const dado = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fallo = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function atender(m: Rpc): Promise<object | null> {
  // Notificaciones (sin id): no llevan respuesta.
  if (m.id === undefined || m.id === null) return null;
  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVIDOR,
        instructions: INSTRUCCIONES,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: HERRAMIENTAS });
    case "tools/call": {
      const nombre = String(m.params?.name ?? "");
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      if (!HERRAMIENTAS.some((h) => h.name === nombre)) return fallo(m.id, -32602, `Herramienta desconocida: ${nombre}`);
      try {
        const texto = await ejecutarHerramienta(nombre, args);
        return ok(m.id, { content: [{ type: "text", text: texto }], isError: false });
      } catch (e) {
        // Errores de la consulta: se devuelven a Claude como resultado para que corrija y reintente.
        const msg = e instanceof ErrorHerramienta || e instanceof Error ? e.message : String(e);
        return ok(m.id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true });
      }
    }
    case "resources/list":
      return ok(m.id, { resources: [] });
    case "prompts/list":
      return ok(m.id, { prompts: [] });
    default:
      return fallo(m.id, -32601, `Método no soportado: ${m.method}`);
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.MCP_TOKEN) return NextResponse.json({ error: "El servidor MCP no está habilitado (falta MCP_TOKEN)." }, { status: 503 });
  if (!autorizado(req)) {
    return NextResponse.json(fallo(null, -32001, "No autorizado"), { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="ag-constructora-mcp"' } });
  }
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fallo(null, -32700, "JSON inválido"), { status: 400 });
  }
  if (Array.isArray(body)) {
    const res = (await Promise.all(body.map(atender))).filter(Boolean);
    return res.length ? NextResponse.json(res) : new NextResponse(null, { status: 202 });
  }
  const res = await atender(body);
  return res ? NextResponse.json(res) : new NextResponse(null, { status: 202 });
}

// Sin sesión ni flujo SSE iniciado por el servidor.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
