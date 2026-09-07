import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { enmascarar, leerConfig, PROVEEDORES } from "@/lib/asistente/config";

export const dynamic = "force-dynamic";

// Configuración del proveedor de IA del asistente — SOLO superadmin.
//   GET  → configuración actual (clave enmascarada) + proveedores
//   POST → guarda {proveedor, base_url, modelo, api_key?}; ?probar=1 solo prueba la conexión
async function gerente() {
  const ses = await supabaseServer();
  if (!ses) return null;
  const { data: { user } } = await ses.auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin().from("usuarios").select("rol, email").eq("id", user.id).maybeSingle();
  return data?.rol === "superadmin" ? { id: user.id, email: data.email as string } : null;
}

export async function GET() {
  if (!(await gerente())) return NextResponse.json({ error: "Solo Gerencia" }, { status: 403 });
  const supa = supabaseAdmin();
  const cfg = await leerConfig(supa);
  const { data } = await supa.from("app_config").select("updated_at, updated_by").eq("clave", "asistente").maybeSingle();
  return NextResponse.json({ ...cfg, api_key: enmascarar(cfg.api_key), tiene_clave: Boolean(cfg.api_key), guardada_en: data?.updated_at ?? null, guardada_por: data?.updated_by ?? null, proveedores: PROVEEDORES });
}

async function probar(base_url: string, modelo: string, api_key: string): Promise<{ ok: boolean; detalle: string }> {
  try {
    const res = await fetch(`${base_url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${api_key}` },
      body: JSON.stringify({ model: modelo, messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 5 }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detalle: j?.error?.message ?? `${res.status} ${res.statusText}` };
    return { ok: true, detalle: `El modelo ${modelo} respondió correctamente.` };
  } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) }; }
}

export async function POST(req: NextRequest) {
  const g = await gerente();
  if (!g) return NextResponse.json({ error: "Solo Gerencia" }, { status: 403 });
  const supa = supabaseAdmin();
  const actual = await leerConfig(supa);
  const b = await req.json().catch(() => ({}));
  const proveedor = String(b.proveedor || actual.proveedor);
  const def = PROVEEDORES[proveedor] ?? PROVEEDORES.otro;
  const base_url = String(b.base_url || def.base_url || actual.base_url).trim().replace(/\/$/, "");
  const modelo = String(b.modelo || def.modelo || actual.modelo).trim();
  const api_key = String(b.api_key ?? "").trim() || actual.api_key; // vacío = conservar la actual
  if (!base_url || !modelo) return NextResponse.json({ error: "Faltan la URL base o el modelo." }, { status: 400 });
  if (!api_key) return NextResponse.json({ error: "Falta la clave de la API." }, { status: 400 });
  if (req.nextUrl.searchParams.get("probar")) return NextResponse.json(await probar(base_url, modelo, api_key));
  const { error } = await supa.from("app_config").upsert({ clave: "asistente", valor: { proveedor, base_url, modelo, api_key }, updated_at: new Date().toISOString(), updated_by: g.email }, { onConflict: "clave" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, api_key: enmascarar(api_key) });
}
