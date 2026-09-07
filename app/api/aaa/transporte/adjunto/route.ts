import { NextRequest, NextResponse } from "next/server";
import { supabaseTransporte } from "@/lib/supabase/server";
import { transporteConfigured } from "@/lib/demo";

// POST /api/aaa/transporte/adjunto
// Sube un adjunto (foto/PDF en base64) al bucket público «evidencias» de
// Supabase Storage y devuelve su URL. Así los meses de transporte_kv guardan
// solo referencias (antes: base64 embebido → 10+ MB por mes y guardados lentos).
// Body: { ns, monthKey, serviceId, name, type, dataUrl }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "evidencias";
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!transporteConfigured()) return NextResponse.json({ error: "Supabase no está configurado" }, { status: 503 });
  let b: { ns?: string; monthKey?: string; serviceId?: string; name?: string; type?: string; dataUrl?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const m = /^data:([\w.+-]+\/[\w.+-]+)?;base64,(.+)$/s.exec(String(b.dataUrl ?? ""));
  if (!m) return NextResponse.json({ error: "Adjunto inválido (se esperaba data URL base64)" }, { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "El adjunto supera 12 MB" }, { status: 400 });
  const type = String(b.type || m[1] || "application/octet-stream");
  const ns = /^[a-z]+$/.test(String(b.ns ?? "")) ? String(b.ns) : "transporte";
  const monthKey = /^\d{4}-\d{2}$/.test(String(b.monthKey ?? "")) ? String(b.monthKey) : "sin-mes";
  const serviceId = String(b.serviceId ?? "s").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || "s";
  const safeName = String(b.name ?? "adjunto").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const path = `${ns}/${monthKey}/${serviceId}/${Date.now()}-${safeName}`;

  const supa = supabaseTransporte();
  const { error } = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (error) return NextResponse.json({ error: `Storage: ${error.message}` }, { status: 500 });
  const { data } = supa.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, path, name: String(b.name ?? safeName), type, size: bytes.length });
}
