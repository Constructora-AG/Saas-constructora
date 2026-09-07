import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Inversión publicitaria mensual (captura manual) para calcular CPL / CPA.
// POST   { mes: 'YYYY-MM', proyecto?: string, canal?: string, monto: number, nota?: string }
// DELETE { id }

async function usuarioActual(): Promise<string | null> {
  const supa = await supabaseServer();
  if (!supa) return "demo";
  const { data } = await supa.auth.getUser();
  return data.user?.email ?? data.user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const quien = await usuarioActual();
  if (!quien) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const mes = String(body.mes ?? "");
  const monto = Number(body.monto);
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "mes debe ser YYYY-MM" }, { status: 400 });
  if (!Number.isFinite(monto) || monto < 0) return NextResponse.json({ error: "monto inválido" }, { status: 400 });

  const fila = {
    mes,
    proyecto: String(body.proyecto ?? "").trim(),
    canal: String(body.canal ?? "").trim(),
    monto,
    nota: body.nota ? String(body.nota) : null,
    created_by: quien,
  };
  const { data, error } = await supabaseAdmin().from("mk_inversion").upsert(fila, { onConflict: "mes,proyecto,canal" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inversion: data });
}

export async function DELETE(req: NextRequest) {
  const quien = await usuarioActual();
  if (!quien) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("mk_inversion").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
