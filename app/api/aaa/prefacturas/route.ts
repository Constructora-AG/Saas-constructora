import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catalogoDe } from "@/lib/aaa/catalogo";

// Flujo: pendiente_acta_migo → por_facturar (automático con acta + migo) → pendiente_pago (automático al adjuntar factura) → pagada | rechazada
const ESTADOS = new Set(["pendiente_acta_migo", "por_facturar", "pendiente_pago", "pagada", "rechazada"]);

interface AdjuntoBody { name?: unknown; type?: unknown; dataUrl?: unknown }
const MAX_ADJUNTO = 6 * 1024 * 1024; // ~6 MB en base64
function limpiarAdjunto(v: unknown): { name: string; type: string; dataUrl: string } | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const a = v as AdjuntoBody;
  const dataUrl = String(a.dataUrl ?? "");
  if (!/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(dataUrl)) throw new Error("Adjunto inválido");
  if (dataUrl.length > MAX_ADJUNTO) throw new Error("El archivo supera el tamaño máximo (~4 MB)");
  return { name: String(a.name ?? "archivo"), type: String(a.type ?? "application/octet-stream"), dataUrl };
}

/** Texto legible del período a partir de las fechas (para tabla y exportes). */
function periodoTexto(desde: unknown, hasta: unknown, fallback: unknown): string | null {
  const f = (s: unknown) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
    if (!m) return null;
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${m[3]} ${meses[+m[2] - 1]} ${m[1]}`;
  };
  const a = f(desde), b = f(hasta);
  if (a && b) return a === b ? a : `${a} al ${b}`;
  if (a) return `desde ${a}`;
  if (b) return `hasta ${b}`;
  return fallback ? String(fallback) : null;
}

/** Valida los ítems contra el catálogo del contrato; devuelve los ítems normalizados o un error legible. */
function validarItems(contrato: string, rawItems: ItemBody[]): { items: Array<Record<string, unknown>>; valorBase: number } | { error: string } {
  if (rawItems.length === 0) return { error: "La prefactura necesita al menos un ítem" };
  if (contrato === "transporte") {
    // Transporte AAA: ítems libres (un servicio registrado por ítem)
    const items: Array<Record<string, unknown>> = [];
    for (const it of rawItems as Array<ItemBody & { maquina?: unknown; unidad?: unknown }>) {
      const nombre = String(it.item ?? "").trim();
      if (!nombre) return { error: "Ítem sin descripción" };
      const cantidad = Number(it.cantidad);
      const vrUnit = Number(it.vr_unit);
      if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: `Cantidad inválida en "${nombre}"` };
      if (!Number.isFinite(vrUnit) || vrUnit < 0) return { error: `Valor inválido en "${nombre}"` };
      items.push({ item: nombre, maquina: String(it.maquina ?? "").trim(), unidad: String(it.unidad ?? "VJ").trim() || "VJ", cantidad, vr_unit: vrUnit, valor_base: Math.round(cantidad * vrUnit * 100) / 100 });
    }
    return { items, valorBase: items.reduce((s, it) => s + Number(it.valor_base), 0) };
  }
  const catalogo = new Map(catalogoDe(contrato).map((c) => [c.item, c]));
  const items: Array<Record<string, unknown>> = [];
  for (const it of rawItems) {
    const nombre = String(it.item ?? "").trim();
    const cat = catalogo.get(nombre);
    if (!cat) return { error: `"${nombre}" no está en el catálogo Herpro del contrato: usa el nombre exacto para que cruce en la facturación` };
    const cantidad = Number(it.cantidad);
    const vrUnit = Number(it.vr_unit);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: `Cantidad inválida en "${nombre}"` };
    if (!Number.isFinite(vrUnit) || vrUnit <= 0) return { error: `Tarifa inválida en "${nombre}"` };
    items.push({ item: cat.item, maquina: cat.maquina, unidad: cat.unidad, cantidad, vr_unit: vrUnit, valor_base: Math.round(cantidad * vrUnit * 100) / 100 });
  }
  return { items, valorBase: items.reduce((s, it) => s + Number(it.valor_base), 0) };
}

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

  if (b.contrato !== "alquiler" && b.contrato !== "emergencia" && b.contrato !== "transporte")
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
  if (!b.fecha_generacion) return NextResponse.json({ error: "Falta la fecha de generación" }, { status: 400 });

  const v = validarItems(String(b.contrato), Array.isArray(b.items) ? (b.items as ItemBody[]) : []);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const { items, valorBase } = v;
  // Soporte obligatorio (imagen o PDF). Las creadas automáticamente desde
  // Transporte AAA (origen: "transporte") nacen sin soporte y quedan bloqueadas.
  let soporte: { name: string; type: string; dataUrl: string } | null = null;
  try {
    soporte = limpiarAdjunto(b.soporte) ?? null;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Soporte inválido" }, { status: 400 });
  }
  if (!soporte && b.contrato !== "transporte") {
    return NextResponse.json({ error: "Adjunta el documento de soporte (imagen o PDF) de la prefactura" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  // N° de prefactura AUTOMÁTICO y consecutivo (PF0001, PF0002, …), como en
  // Transporte AAA. Se calcula en el servidor sobre el máximo existente; si
  // dos registros coinciden (23505) se reintenta con el siguiente número.
  const siguienteNumero = async (): Promise<string> => {
    const { data: filas } = await supa.from("aaa_prefacturas").select("numero");
    let max = 0;
    (filas ?? []).forEach((r) => {
      const n = parseInt(String(r.numero ?? "").replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return "PF" + String(max + 1).padStart(4, "0");
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
      servicios: Array.isArray(b.servicios) ? b.servicios : null,
      soporte,
      area_aaa: b.area_aaa ? String(b.area_aaa).trim() || null : null,
      interventor: b.interventor ? String(b.interventor).trim() || null : null,
      periodo_desde: b.periodo_desde || null,
      periodo_hasta: b.periodo_hasta || null,
      periodo: periodoTexto(b.periodo_desde, b.periodo_hasta, b.periodo),
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

// PATCH /api/aaa/prefacturas — edición completa, estado, documentos
// Body: { id, contrato?, fecha_generacion?, fecha_vencimiento?, centro_costo?, periodo?, lugar?, nota?,
//         items?, estado?, numero_factura?, fecha_factura?, acta?, migo? }
// Al quedar cargados acta Y migo, una prefactura "pendiente_acta_migo" pasa sola a "pendiente_pago".
export async function PATCH(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (b.estado && !ESTADOS.has(String(b.estado))) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  if (b.contrato !== undefined && b.contrato !== "alquiler" && b.contrato !== "emergencia" && b.contrato !== "transporte")
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: actual, error: e0 } = await supa.from("aaa_prefacturas").select("*").eq("id", b.id).single();
  if (e0 || !actual) return NextResponse.json({ error: "Prefactura no encontrada" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const k of ["contrato", "fecha_generacion", "fecha_vencimiento", "centro_costo", "area_aaa", "interventor", "servicios", "periodo", "periodo_desde", "periodo_hasta", "lugar", "nota", "estado", "numero_factura", "fecha_factura"]) {
    if (k in b) patch[k] = b[k];
  }
  if ("periodo_desde" in b || "periodo_hasta" in b) {
    patch.periodo = periodoTexto(patch.periodo_desde ?? actual.periodo_desde, patch.periodo_hasta ?? actual.periodo_hasta, patch.periodo ?? actual.periodo);
  }
  if (b.items !== undefined) {
    const v = validarItems(String(patch.contrato ?? actual.contrato), Array.isArray(b.items) ? (b.items as ItemBody[]) : []);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.items = v.items;
    patch.valor_base = v.valorBase;
  }
  try {
    const acta = limpiarAdjunto(b.acta);
    const migo = limpiarAdjunto(b.migo);
    const factura = limpiarAdjunto(b.factura);
    const soporte = limpiarAdjunto(b.soporte);
    if (soporte !== undefined) patch.soporte = soporte;
    if (acta !== undefined) patch.acta = acta;
    if (migo !== undefined) patch.migo = migo;
    if (factura !== undefined) patch.factura = factura;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Adjunto inválido" }, { status: 400 });
  }
  // Bloqueo: sin soporte no se cargan documentos ni cambia el estado.
  // Excepción: las de Transporte AAA, cuyo soporte son las evidencias fotográficas de los servicios.
  const soporteFinal = "soporte" in patch ? patch.soporte : actual.soporte;
  const contratoFinal = String(patch.contrato ?? actual.contrato);
  if (contratoFinal !== "transporte" && !soporteFinal && ("acta" in patch || "migo" in patch || "factura" in patch || "estado" in patch)) {
    return NextResponse.json({ error: "La prefactura está bloqueada: primero carga el documento de soporte" }, { status: 400 });
  }
  // Transiciones automáticas:
  //  · acta + migo cargados  → "pendiente_acta_migo" pasa a "por_facturar"
  //  · factura adjunta       → "por_facturar" pasa a "pendiente_pago"
  const actaFinal = "acta" in patch ? patch.acta : actual.acta;
  const migoFinal = "migo" in patch ? patch.migo : actual.migo;
  const facturaFinal = "factura" in patch ? patch.factura : actual.factura;
  let estadoFinal = String(patch.estado ?? actual.estado);
  if (actaFinal && migoFinal && estadoFinal === "pendiente_acta_migo") estadoFinal = "por_facturar";
  if (facturaFinal && estadoFinal === "por_facturar") {
    estadoFinal = "pendiente_pago";
    if (!("fecha_factura" in patch) && !actual.fecha_factura) patch.fecha_factura = new Date().toISOString().slice(0, 10);
  }
  if (estadoFinal !== String(actual.estado) || "estado" in patch) patch.estado = estadoFinal;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supa.from("aaa_prefacturas").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prefactura: data });
}

// DELETE /api/aaa/prefacturas — Body: { id }
export async function DELETE(req: NextRequest) {
  let b: { id?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const supa = supabaseAdmin();
  const { data: row } = await supa.from("aaa_prefacturas").select("numero, servicios").eq("id", b.id).maybeSingle();
  const { error } = await supa.from("aaa_prefacturas").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Prefactura de Transporte AAA: liberar los servicios que tenía incluidos
  const servicios = Array.isArray(row?.servicios) ? (row!.servicios as Array<{ monthKey: string; id: string }>) : [];
  const porMes = new Map<string, Set<string>>();
  servicios.forEach((s) => { if (!porMes.has(s.monthKey)) porMes.set(s.monthKey, new Set()); porMes.get(s.monthKey)!.add(s.id); });
  for (const [mk, ids] of porMes) {
    const key = `services:${mk}`;
    const { data: kv } = await supa.from("transporte_kv").select("value").eq("key", key).maybeSingle();
    if (!kv?.value) continue;
    try {
      const arr = JSON.parse(String(kv.value)) as Array<{ id: string; prefactura?: string | null }>;
      const next = arr.map((s) => (ids.has(s.id) && s.prefactura === row?.numero ? { ...s, prefactura: null } : s));
      await supa.from("transporte_kv").upsert({ key, value: JSON.stringify(next) }, { onConflict: "key" });
    } catch { /* si el mes no se puede leer, se deja como está */ }
  }
  return NextResponse.json({ ok: true, liberados: servicios.length });
}
