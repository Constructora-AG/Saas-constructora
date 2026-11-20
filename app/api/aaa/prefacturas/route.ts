import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirCualquieraDeModulos, esRespuestaAutorizacion } from "@/lib/auth/servidor";
import {
  aplicarTransicionPrefactura,
  contratoValido,
  ESTADOS_PREFACTURA,
  limpiarAdjunto,
  mas30Dias,
  periodoTexto,
  validarItems,
  type ItemBody,
} from "@/lib/aaa/prefacturas";

// GET /api/aaa/prefacturas — lista completa (el cliente filtra)
export async function GET() {
  const acceso = await exigirCualquieraDeModulos(["aaa", "transporte"]);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("aaa_prefacturas")
    .select("*")
    .order("fecha_generacion", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefacturas: data });
}

// POST /api/aaa/prefacturas
// Body: { contrato, fecha_generacion, (numero se asigna automático) periodo?, lugar?, nota?, items: [{ item, cantidad, vr_unit }] }
// Los ítems se validan contra el catálogo Herpro del contrato: nombre no catalogado = rechazo.
export async function POST(req: NextRequest) {
  const acceso = await exigirCualquieraDeModulos(["aaa", "transporte"]);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!contratoValido(b.contrato))
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });
  if (!b.fecha_generacion) return NextResponse.json({ error: "Falta la fecha de generación" }, { status: 400 });
  // Vencimiento: SIEMPRE 30 días calendario después de la generación (regla AG)
  b.fecha_vencimiento = mas30Dias(String(b.fecha_generacion)) ?? b.fecha_vencimiento ?? null;

  const v = validarItems(String(b.contrato), Array.isArray(b.items) ? (b.items as ItemBody[]) : [], b.origen === "modulo" || b.origen === "transporte");
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
  if (!soporte && b.contrato !== "transporte" && b.origen !== "modulo") {
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
  const acceso = await exigirCualquieraDeModulos(["aaa", "transporte"]);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (b.estado && !ESTADOS_PREFACTURA.has(String(b.estado))) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  if (b.contrato !== undefined && !contratoValido(b.contrato))
    return NextResponse.json({ error: "Contrato inválido" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: actual, error: e0 } = await supa.from("aaa_prefacturas").select("*").eq("id", b.id).single();
  if (e0 || !actual) return NextResponse.json({ error: "Prefactura no encontrada" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const k of ["contrato", "fecha_generacion", "fecha_vencimiento", "centro_costo", "area_aaa", "interventor", "servicios", "periodo", "periodo_desde", "periodo_hasta", "lugar", "nota", "estado", "numero_factura", "fecha_factura"]) {
    if (k in b) patch[k] = b[k];
  }
  if ("fecha_generacion" in b) patch.fecha_vencimiento = mas30Dias(String(b.fecha_generacion)) ?? patch.fecha_vencimiento ?? actual.fecha_vencimiento;
  if ("periodo_desde" in b || "periodo_hasta" in b) {
    patch.periodo = periodoTexto(patch.periodo_desde ?? actual.periodo_desde, patch.periodo_hasta ?? actual.periodo_hasta, patch.periodo ?? actual.periodo);
  }
  if (b.items !== undefined) {
    const v = validarItems(String(patch.contrato ?? actual.contrato), Array.isArray(b.items) ? (b.items as ItemBody[]) : [], Array.isArray(actual.servicios) && actual.servicios.length > 0);
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
  const transicion = aplicarTransicionPrefactura({
    actualEstado: String(actual.estado),
    actualActa: actual.acta,
    actualMigo: actual.migo,
    actualFactura: actual.factura,
    actualFechaFactura: actual.fecha_factura,
    patch,
  });
  Object.assign(patch, transicion.patch);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supa.from("aaa_prefacturas").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prefactura: data });
}

// DELETE /api/aaa/prefacturas — Body: { id }
export async function DELETE(req: NextRequest) {
  const acceso = await exigirCualquieraDeModulos(["aaa", "transporte"]);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  let b: { id?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const supa = supabaseAdmin();
  const { data: row } = await supa.from("aaa_prefacturas").select("numero, contrato, servicios").eq("id", b.id).maybeSingle();
  const { error } = await supa.from("aaa_prefacturas").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Prefactura de Transporte AAA, Contrato de Alquiler u Otro Sí / Emergencia: liberar los servicios que tenía
  // incluidos, cada uno en el espacio de datos de SU módulo (nunca se cruzan).
  const prefijo = !row?.contrato || !contratoValido(row.contrato) ? null : row.contrato === "transporte" ? "" : `${row.contrato}:`;
  if (prefijo === null) return NextResponse.json({ ok: true, liberados: 0 });
  const servicios = Array.isArray(row?.servicios) ? (row!.servicios as Array<{ monthKey: string; id: string }>) : [];
  const porMes = new Map<string, Set<string>>();
  servicios.forEach((s) => { if (!porMes.has(s.monthKey)) porMes.set(s.monthKey, new Set()); porMes.get(s.monthKey)!.add(s.id); });
  for (const [mk, ids] of porMes) {
    const key = `${prefijo}services:${mk}`;
    const { data: kv } = await supa.from("transporte_kv").select("value").eq("key", key).maybeSingle();
    if (!kv?.value) continue;
    try {
      const arr = JSON.parse(String(kv.value)) as Array<{ id: string; prefactura?: string | null }>;
      if (!arr.some((s) => ids.has(s.id) && s.prefactura === row?.numero)) continue;
      const next = arr.map((s) => (ids.has(s.id) && s.prefactura === row?.numero ? { ...s, prefactura: null } : s));
      await supa.from("transporte_kv").upsert({ key, value: JSON.stringify(next) }, { onConflict: "key" });
    } catch { /* si el mes no se puede leer, se deja como está */ }
  }
  return NextResponse.json({ ok: true, liberados: servicios.length });
}
