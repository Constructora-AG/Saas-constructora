import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/gestion
// Registra una gestión en la bitácora (dispara el trigger que actualiza el estado).
// Body: { prospect_id, canal, tipo, cobrador_id?, cobrador_nombre?, resultado?, nota?,
//         estado_nuevo?, evidencia_url?, monto_comprometido?, fecha_compromiso? }
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!b.prospect_id) return NextResponse.json({ error: "Falta prospect_id" }, { status: 400 });
  if (!b.canal) return NextResponse.json({ error: "Falta canal" }, { status: 400 });

  const supa = supabaseAdmin();

  // Estado anterior (para la bitácora).
  const { data: prev } = await supa
    .from("cartera_gestion")
    .select("estado")
    .eq("prospect_id", b.prospect_id)
    .maybeSingle();

  const { data, error } = await supa
    .from("gestion_log")
    .insert({
      prospect_id: b.prospect_id,
      canal: b.canal,
      tipo: b.tipo ?? "contacto",
      cobrador_id: b.cobrador_id ?? null,
      cobrador_nombre: b.cobrador_nombre ?? null,
      resultado: b.resultado ?? null,
      nota: b.nota ?? null,
      estado_anterior: prev?.estado ?? null,
      estado_nuevo: b.estado_nuevo ?? null,
      evidencia_url: b.evidencia_url ?? null,
      monto_comprometido: b.monto_comprometido ?? null,
      fecha_compromiso: b.fecha_compromiso ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gestion: data });
}
