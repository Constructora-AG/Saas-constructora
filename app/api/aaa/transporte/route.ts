import { NextRequest, NextResponse } from "next/server";
import { supabaseTransporte } from "@/lib/supabase/server";
import { transporteConfigured } from "@/lib/demo";

// API clave-valor del panel de Transporte AAA (tabla transporte_kv).
// Contrato idéntico al window.storage del panel original:
//   GET  /api/aaa/transporte?key=adminconfig   → { key, value } | { key, value: null }
//   GET  /api/aaa/transporte?list=1            → { keys: string[] }
//   POST /api/aaa/transporte  { key, value }   → set (upsert); value SIEMPRE string JSON
//   DELETE /api/aaa/transporte?key=…           → { key, deleted: true }

export const dynamic = "force-dynamic";

function sinSupabase() {
  return NextResponse.json(
    { error: "Supabase no está configurado; el módulo corre en modo demo en el navegador." },
    { status: 503 },
  );
}

/** Traduce el error de PostgREST cuando la tabla aún no existe (PGRST205 / 42P01). */
function errorLegible(error: { code?: string; message: string }) {
  if (error.code === "PGRST205" || error.code === "42P01" || /transporte_kv/.test(error.message)) {
    return NextResponse.json(
      { error: "La tabla transporte_kv aún no existe en Supabase. Ejecuta supabase/transporte_kv.sql en el SQL Editor y vuelve a intentar." },
      { status: 500 },
    );
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET(req: NextRequest) {
  if (!transporteConfigured()) return sinSupabase();
  const { searchParams } = new URL(req.url);
  const supa = supabaseTransporte();

  if (searchParams.get("list")) {
    // keys + fecha de actualización por clave: el cliente solo recarga lo que cambió
    const { data, error } = await supa.from("transporte_kv").select("key, updated_at");
    if (error) return errorLegible(error);
    const rows = (data ?? []) as Array<{ key: string; updated_at: string | null }>;
    return NextResponse.json({ keys: rows.map((r) => r.key), updated: Object.fromEntries(rows.map((r) => [r.key, r.updated_at ?? ""])) });
  }

  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Falta ?key= o ?list=1" }, { status: 400 });
  const { data, error } = await supa.from("transporte_kv").select("key,value").eq("key", key).maybeSingle();
  if (error) return errorLegible(error);
  return NextResponse.json({ key, value: data ? (data.value as string) : null });
}

export async function POST(req: NextRequest) {
  if (!transporteConfigured()) return sinSupabase();
  let b: { key?: unknown; value?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const key = String(b.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "Falta key" }, { status: 400 });
  if (typeof b.value !== "string") return NextResponse.json({ error: "value debe ser un string JSON" }, { status: 400 });

  const supa = supabaseTransporte();
  const { error } = await supa.from("transporte_kv").upsert({ key, value: b.value }, { onConflict: "key" });
  if (error) return errorLegible(error);
  return NextResponse.json({ key, value: b.value });
}

export async function DELETE(req: NextRequest) {
  if (!transporteConfigured()) return sinSupabase();
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Falta ?key=" }, { status: 400 });
  const supa = supabaseTransporte();
  const { error } = await supa.from("transporte_kv").delete().eq("key", key);
  if (error) return errorLegible(error);
  return NextResponse.json({ key, deleted: true });
}
