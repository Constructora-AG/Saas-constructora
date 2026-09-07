import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catalogoDe } from "@/lib/aaa/catalogo";

const ESTADOS = new Set(["en_conciliacion", "con_orden", "facturada", "pagada", "rechazada"]);

// GET /api/aaa/prefacturas — lista completa (el cliente filtra)
export async function GET() {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("aaa_prefacturas")
    .select("*")
    .order("fecha_generacion", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefacturas: data });
}

interface ItemBody {
  item?: unknown;
  cantidad?: unknown;
  vr_unit?: unknown;
}

// POST /api/aaa/prefacturas
// Body: { contrato, fecha_generacion, (numero se asigna automático) periodo?, lugar?, nota?, items: [{ item, cantidad, vr_unit }] }
// Los ítems se validan contra el catálogo Herpro del contrato: nombre no catalogado = rechazo.
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (b.contrato !== "alquiler" && b.contrato !== "emergencia")
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
  if (!b.fecha_generacion) return NextResponse.json({ error: "Falta la fecha de generación" }, { status: 400 });

  const catalogo = new Map(catalogoDe(String(b.contrato)).map((c) => [c.item, c]));
  const rawItems = Array.isArray(b.items) ? (b.items as ItemBody[]) : [];
  if (rawItems.length === 0) return NextResponse.json({ error: "La prefactura necesita al menos un ítem" }, { status: 400 });

  const items = [];
  for (const it of rawItems) {
    const nombre = String(it.item ?? "").trim();
    const cat = catalogo.get(nombre);
    if (!cat)
      return NextResponse.json(
        { error: `"${nombre}" no está en el catálogo Herpro del contrato: usa el nombre exacto para que cruce en la facturación` },
        { status: 400 },
      );
    const cantidad = Number(it.cantidad);
    const vrUnit = Number(it.vr_unit);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return NextResponse.json({ error: `Cantidad inválida en "${nombre}"` }, { status: 400 });
    if (!Number.isFinite(vrUnit) || vrUnit <= 0) return NextResponse.json({ error: `Tarifa inválida en "${nombre}"` }, { status: 400 });
    items.push({
      item: cat.item,
      maquina: cat.maquina,
      unidad: cat.unidad,
      cantidad,
      vr_unit: vrUnit,
      valor_base: Math.round(cantidad * vrUnit * 100) / 100,
    });
  }
  const valorBase = items.reduce((s, it) => s + it.valor_base, 0);

  const supa = supabaseAdmin();
  // N° de prefactura AUTOMÁTICO y consecutivo (0001, 0002, …), como en
  // Transporte AAA. Se calcula en el servidor sobre el máximo existente; si
  // dos registros coinciden (23505) se reintenta con el siguiente número.
  const siguienteNumero = async (): Promise<string> => {
    const { data: filas } = await supa.from("aaa_prefacturas").select("numero");
    let max = 0;
    (filas ?? []).forEach((r) => {
      const n = parseInt(String(r.numero ?? "").replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return String(max + 1).padStart(4, "0");
  };
  let data: Record<string, unknown> | null = null;
  let error: { code?: string; message: string } | null = null;
  for (let intento = 0; intento < 3; intento++) {
    const numero = await siguienteNumero();
    const r = await supa
    .from("aaa_prefacturas")
    .insert({
      numero,
      contrato: b.contrato,
      fecha_generacion: b.fecha_generacion,
      fecha_vencimiento: b.fecha_vencimiento ?? null,
      centro_costo: b.centro_costo ?? null,
      periodo: b.periodo ?? null,
      lugar: b.lugar ?? null,
      items,
      valor_base: valorBase,
      nota: b.nota ?? null,
    })
    .select()
    .single();
    data = (r.data as Record<string, unknown> | null) ?? null;
    error = r.error;
    if (!error || error.code !== "23505") break;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prefactura: data });
}

// PATCH /api/aaa/prefacturas — cambio de estado / datos de factura
// Body: { id, estado?, numero_factura?, fecha_factura?, nota? }
export async function PATCH(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (b.estado && !ESTADOS.has(String(b.estado))) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const k of ["estado", "numero_factura", "fecha_factura", "nota"]) {
    if (k in b) patch[k] = b[k];
  }

  const supa = supabaseAdmin();
  const { data, error } = await supa.from("aaa_prefacturas").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prefactura: data });
}
