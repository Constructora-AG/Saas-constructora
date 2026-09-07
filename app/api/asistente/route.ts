import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { ROL_LABELS, type RolPlataforma } from "@/lib/auth/modulos";
import { areasDe, tablasPermitidas, validarAlcanceSql } from "@/lib/asistente/alcance";
import { leerConfig, type AsistenteConfig } from "@/lib/asistente/config";
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
// Proveedor: cualquier API compatible con OpenAI (chat/completions + tools).
// La configuración (proveedor, URL, modelo, clave) vive en app_config y se
// edita desde el módulo Configuración IA; si no existe, variables de entorno.
const MAX_PASOS = 12;

interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
async function chat(cfg: AsistenteConfig, messages: ChatMsg[], tools: unknown[]): Promise<{ content: string; tool_calls: ToolCall[] }> {
  const res = await fetch(`${cfg.base_url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
    body: JSON.stringify({ model: cfg.modelo, messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 6000 }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
  const m = j.choices?.[0]?.message ?? {};
  return { content: typeof m.content === "string" ? m.content : "", tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : [] };
}

interface Paso { proposito: string; sql: string; filas: number; error?: string }
interface Mensaje { role: "user" | "assistant"; content: string; pasos?: Paso[]; at: string }

async function usuarioActual() {
  const ses = await supabaseServer();
  if (!ses) return null;
  const { data: { user } } = await ses.auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin().from("usuarios").select("id, nombre, email, rol, modulos").eq("id", user.id).maybeSingle();
  if (!data) return null;
  // Todo usuario con sesión puede usar el asistente; el alcance de datos lo fija su rol.
  return { id: data.id as string, nombre: (data.nombre as string) || (data.email as string), rol: data.rol as RolPlataforma, modulos: (data.modulos as string[]) ?? [] };
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
  const cfg = await leerConfig(supa);
  return NextResponse.json({ conversaciones: data ?? [], configurado: Boolean(cfg.api_key), areas: areasDe(u), rol: u.rol });
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
  const supa0 = supabaseAdmin();
  const cfg = await leerConfig(supa0);
  if (!cfg.api_key) return NextResponse.json({ error: "El asistente no está configurado. Gerencia debe cargar la clave de la API en Configuración IA." }, { status: 503 });
  const permitidas = tablasPermitidas(u);
  const body = await req.json().catch(() => ({}));
  const mensaje = String(body.mensaje ?? "").trim();
  if (!mensaje) return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });
  const supa = supa0;

  // Conversación (existente o nueva)
  let id: string | null = body.id ?? null;
  let historial: Mensaje[] = [];
  if (id) {
    const { data } = await supa.from("asistente_conversaciones").select("mensajes").eq("id", id).eq("usuario_id", u.id).maybeSingle();
    if (!data) id = null; else historial = (data.mensajes as Mensaje[]) ?? [];
  }

  // Bucle de herramientas (formato OpenAI)
  const tools = [{
    type: "function",
    function: {
      name: "consultar_sql",
      description: "Ejecuta una consulta SELECT de solo lectura sobre la base de datos de la plataforma y devuelve las filas en JSON (máximo 300).",
      parameters: {
        type: "object",
        properties: {
          proposito: { type: "string", description: "Qué buscas con la consulta, en una frase (se muestra al usuario)." },
          sql: { type: "string", description: "Consulta SQL PostgreSQL. Solo SELECT/WITH, sin punto y coma." },
        },
        required: ["proposito", "sql"],
      },
    },
  }];
  const mensajes: ChatMsg[] = [
    { role: "system", content: sistemaAsistente(u.nombre, ROL_LABELS[u.rol] ?? u.rol, areasDe(u)) },
    ...historial.slice(-16).map((m) => ({ role: m.role, content: m.content }) as ChatMsg),
    { role: "user", content: mensaje },
  ];
  const pasos: Paso[] = [];
  let respuesta = "";
  try {
    for (let i = 0; i < MAX_PASOS; i++) {
      const res = await chat(cfg, mensajes, tools);
      if (res.tool_calls.length === 0) { respuesta = res.content.trim(); break; }
      mensajes.push({ role: "assistant", content: res.content || null, tool_calls: res.tool_calls });
      for (const tc of res.tool_calls) {
        let inp: { proposito?: string; sql?: string } = {};
        try { inp = JSON.parse(tc.function.arguments || "{}"); } catch { inp = {}; }
        const sql = String(inp.sql ?? "");
        if (tc.function.name !== "consultar_sql" || !sql) {
          mensajes.push({ role: "tool", tool_call_id: tc.id, content: "ERROR: herramienta o argumentos inválidos" }); continue;
        }
        const motivo = validarAlcanceSql(sql, permitidas);
        if (motivo) {
          pasos.push({ proposito: inp.proposito ?? "", sql, filas: 0, error: motivo });
          mensajes.push({ role: "tool", tool_call_id: tc.id, content: `ERROR DE PERMISOS: ${motivo}` });
          continue;
        }
        const { data, error } = await supa.rpc("asistente_consulta", { q: sql });
        if (error) {
          pasos.push({ proposito: inp.proposito ?? "", sql, filas: 0, error: error.message });
          mensajes.push({ role: "tool", tool_call_id: tc.id, content: `ERROR: ${error.message}` });
        } else {
          const filas = Array.isArray(data) ? data : [];
          pasos.push({ proposito: inp.proposito ?? "", sql, filas: filas.length });
          let txt = JSON.stringify(filas);
          if (txt.length > 40_000) txt = txt.slice(0, 40_000) + "… (truncado: agrega filtros o agrupa)";
          mensajes.push({ role: "tool", tool_call_id: tc.id, content: txt });
        }
      }
      if (i === MAX_PASOS - 1) respuesta = res.content.trim() || "No alcancé a terminar el análisis. Intenta con una pregunta más acotada.";
    }
    if (!respuesta) respuesta = "No obtuve una respuesta del modelo. Intenta de nuevo.";
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
