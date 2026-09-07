import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { puedeVer, type RolPlataforma } from "@/lib/auth/modulos";
import { sistemaAsistente } from "@/lib/asistente/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ════════════════════════════════════════════════════════════════════
// Asistente de gerencia (chat IA con acceso de solo lectura a la BD).
//   GET    /api/asistente            → lista de conversaciones del usuario
//   GET    /api/asistente?id=…       → mensajes de una conversación
//   POST   /api/asistente {id?, mensaje} → respuesta del asistente
//   DELETE /api/asistente?id=…       → elimina la conversación
// Solo usuarios con el módulo `asistente` (superadmin o extra otorgado).
// ════════════════════════════════════════════════════════════════════
const MODEL = process.env.ASISTENTE_MODEL || "claude-opus-5";
const MAX_PASOS = 12;

interface Paso { proposito: string; sql: string; filas: number; error?: string }
interface Mensaje { role: "user" | "assistant"; content: string; pasos?: Paso[]; at: string }

async function usuarioActual() {
  const ses = await supabaseServer();
  if (!ses) return null;
  const { data: { user } } = await ses.auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin().from("usuarios").select("id, nombre, email, rol, modulos").eq("id", user.id).maybeSingle();
  if (!data) return null;
  const u = { id: data.id as string, nombre: (data.nombre as string) || (data.email as string), rol: data.rol as RolPlataforma, modulos: (data.modulos as string[]) ?? [] };
  return puedeVer(u, "asistente") ? u : null;
}

export async function GET(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const supa = supabaseAdmin();
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const { data } = await supa.from("asistente_conversaciones").select("id, titulo, mensajes, updated_at").eq("id", id).eq("usuario_id", u.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 });
    return NextResponse.json(data);
  }
  const { data } = await supa.from("asistente_conversaciones").select("id, titulo, updated_at").eq("usuario_id", u.id).order("updated_at", { ascending: false }).limit(50);
  return NextResponse.json({ conversaciones: data ?? [], configurado: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function DELETE(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await supabaseAdmin().from("asistente_conversaciones").delete().eq("id", id).eq("usuario_id", u.id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "El asistente no está configurado: falta la clave ANTHROPIC_API_KEY en el servidor." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const mensaje = String(body.mensaje ?? "").trim();
  if (!mensaje) return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });
  const supa = supabaseAdmin();

  // Conversación (existente o nueva)
  let id: string | null = body.id ?? null;
  let historial: Mensaje[] = [];
  if (id) {
    const { data } = await supa.from("asistente_conversaciones").select("mensajes").eq("id", id).eq("usuario_id", u.id).maybeSingle();
    if (!data) id = null; else historial = (data.mensajes as Mensaje[]) ?? [];
  }

  // Bucle de herramientas
  const client = new Anthropic({ apiKey });
  const tools: Anthropic.Tool[] = [{
    name: "consultar_sql",
    description: "Ejecuta una consulta SELECT de solo lectura sobre la base de datos de la plataforma y devuelve las filas en JSON (máximo 300).",
    input_schema: {
      type: "object",
      properties: {
        proposito: { type: "string", description: "Qué buscas con la consulta, en una frase (se muestra al usuario)." },
        sql: { type: "string", description: "Consulta SQL PostgreSQL. Solo SELECT/WITH, sin punto y coma." },
      },
      required: ["proposito", "sql"],
    },
  }];
  const mensajes: Anthropic.MessageParam[] = [
    ...historial.slice(-16).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: mensaje },
  ];
  const pasos: Paso[] = [];
  let respuesta = "";
  try {
    for (let i = 0; i < MAX_PASOS; i++) {
      const res = await client.messages.create({ model: MODEL, max_tokens: 6000, system: sistemaAsistente(u.nombre), tools, messages: mensajes });
      const textos = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
      const usos = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || usos.length === 0) { respuesta = textos.join("\n").trim(); break; }
      mensajes.push({ role: "assistant", content: res.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usos) {
        const inp = uso.input as { proposito?: string; sql?: string };
        const sql = String(inp.sql ?? "");
        const { data, error } = await supa.rpc("asistente_consulta", { q: sql });
        if (error) {
          pasos.push({ proposito: inp.proposito ?? "", sql, filas: 0, error: error.message });
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: `ERROR: ${error.message}`, is_error: true });
        } else {
          const filas = Array.isArray(data) ? data : [];
          pasos.push({ proposito: inp.proposito ?? "", sql, filas: filas.length });
          let txt = JSON.stringify(filas);
          if (txt.length > 40_000) txt = txt.slice(0, 40_000) + "… (truncado: agrega filtros o agrupa)";
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: txt });
        }
      }
      mensajes.push({ role: "user", content: resultados });
      if (i === MAX_PASOS - 1) respuesta = textos.join("\n").trim() || "No alcancé a terminar el análisis. Intenta con una pregunta más acotada.";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `El asistente no pudo responder: ${msg}` }, { status: 502 });
  }

  // Guardar
  const ahora = new Date().toISOString();
  const nuevos: Mensaje[] = [...historial, { role: "user", content: mensaje, at: ahora }, { role: "assistant", content: respuesta, pasos, at: ahora }];
  const titulo = historial.length ? undefined : mensaje.replace(/\s+/g, " ").slice(0, 70);
  if (id) {
    await supa.from("asistente_conversaciones").update({ mensajes: nuevos, updated_at: ahora }).eq("id", id);
  } else {
    const { data } = await supa.from("asistente_conversaciones").insert({ usuario_id: u.id, titulo, mensajes: nuevos }).select("id").single();
    id = data?.id ?? null;
  }
  return NextResponse.json({ id, titulo, respuesta, pasos });
}
