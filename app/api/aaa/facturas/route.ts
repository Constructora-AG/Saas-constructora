import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/demo";
import iniciales from "@/lib/aaa/facturas-iniciales.json";

// Registro de facturas emitidas a Triple A (tabla aaa_facturas, supabase/aaa_facturas.sql).
// contrato: "emergencia" (Otro Sí) | "alquiler" (Contrato de Alquiler).
const CONTRATOS = new Set(["alquiler", "emergencia"]);
const SIN_TABLA = "Falta crear la tabla de facturas: ejecuta supabase/aaa_facturas.sql en Supabase > SQL Editor.";

function errorDb(e: { code?: string; message: string }) {
  // 42P01 = relación inexistente; PGRST205 = tabla fuera del caché de PostgREST
  const sinTabla = e.code === "42P01" || e.code === "PGRST205";
  return NextResponse.json({ error: sinTabla ? SIN_TABLA : e.message }, { status: 500 });
}

/** Valida y normaliza los campos editables; devuelve el patch o un error legible. */
function limpiar(b: Record<string, unknown>, parcial: boolean): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  if (!parcial || b.contrato !== undefined) {
    if (!CONTRATOS.has(String(b.contrato))) return { error: "Contrato inválido" };
    out.contrato = b.contrato;
  }
  if (!parcial || b.numero !== undefined) {
    const n = String(b.numero ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!n) return { error: "Falta el N° de factura" };
    out.numero = n;
  }
  if (!parcial || b.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? ""))) return { error: "Falta la fecha de la factura" };
    out.fecha = b.fecha;
  }
  if (!parcial || b.concepto !== undefined) {
    const c = String(b.concepto ?? "").trim();
    if (!c) return { error: "Falta el concepto" };
    out.concepto = c;
  }
  if (!parcial || b.valor_total !== undefined) {
    const v = Number(b.valor_total);
    if (!Number.isFinite(v) || v <= 0) return { error: "El valor total debe ser mayor que cero" };
    out.valor_total = Math.round(v * 100) / 100;
  }
  if (b.nota !== undefined) out.nota = String(b.nota ?? "").trim() || null;
  return out;
}

// GET /api/aaa/facturas?contrato=emergencia|alquiler
export async function GET(req: NextRequest) {
  const contrato = req.nextUrl.searchParams.get("contrato") ?? "";
  if (!CONTRATOS.has(contrato)) return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
  if (!supabaseConfigured()) {
    const demo = iniciales.filter((f) => f.contrato === contrato).map((f, i) => ({ id: `demo-${contrato}-${i}`, ...f }));
    return NextResponse.json({ facturas: demo, demo: true });
  }
  const { data, error } = await supabaseAdmin()
    .from("aaa_facturas")
    .select("*")
    .eq("contrato", contrato)
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true });
  if (error) return errorDb(error);
  return NextResponse.json({ facturas: data });
}

// POST /api/aaa/facturas — Body: { contrato, numero, fecha, concepto, valor_total, nota? }
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const f = limpiar(b, false);
  if ("error" in f) return NextResponse.json(f, { status: 400 });
  const { data, error } = await supabaseAdmin().from("aaa_facturas").insert(f).select().single();
  if (error?.code === "23505") return NextResponse.json({ error: `La factura ${f.numero} ya está registrada en este contrato.` }, { status: 409 });
  if (error) return errorDb(error);
  return NextResponse.json({ ok: true, factura: data });
}

// PATCH /api/aaa/facturas — Body: { id, numero?, fecha?, concepto?, valor_total?, nota? }
export async function PATCH(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const f = limpiar(b, true);
  if ("error" in f) return NextResponse.json(f, { status: 400 });
  const { data, error } = await supabaseAdmin().from("aaa_facturas").update(f).eq("id", String(b.id)).select().single();
  if (error?.code === "23505") return NextResponse.json({ error: `La factura ${f.numero} ya está registrada en este contrato.` }, { status: 409 });
  if (error) return errorDb(error);
  return NextResponse.json({ ok: true, factura: data });
}

// DELETE /api/aaa/facturas — Body: { id }
export async function DELETE(req: NextRequest) {
  let b: { id?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("aaa_facturas").delete().eq("id", b.id);
  if (error) return errorDb(error);
  return NextResponse.json({ ok: true });
}
