import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirModulo, esRespuestaAutorizacion, type UsuarioServidor } from "@/lib/auth/servidor";
import { puedeVer } from "@/lib/auth/modulos";
import { limpiarAdjunto } from "@/lib/aaa/prefacturas";
import {
  COLUMNAS_LISTA,
  faltantesParaEnviar,
  limpiarCifras,
  limpiarMoraDestacada,
  limpiarSeparaciones,
  limpiarTextoLargo,
  nombrePeriodo,
  periodoDesdeMes,
  type AccionInforme,
  type CifraProyecto,
  type EstadoInforme,
  type EventoHistorial,
  type SeparacionInforme,
} from "@/lib/cartera/informes";

// ════════════════════════════════════════════════════════════════════
// /api/cartera/informes — informes mensuales de gestión de cartera.
//   GET    [?id=<uuid>]  lista (sin adjunto) o un informe con su adjunto
//   POST   crea un borrador { periodo: "YYYY-MM", cifras, separaciones,
//          mora_destacada, analisis, recomendaciones, adjunto?, enviar? }
//   PATCH  { id, accion: "guardar" | "enviar" | "aprobar" | "devolver" | "reabrir", nota?, ...campos }
//   DELETE ?id=<uuid>    solo borradores
// Ver y subir: módulo «cartera». Aprobar/devolver/reabrir: permiso «cartera_revision».
// ════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLES: EstadoInforme[] = ["borrador", "observado"];

const puedeRevisar = (u: UsuarioServidor) => puedeVer(u, "cartera_revision");

function evento(u: UsuarioServidor, accion: AccionInforme, nota: string | null = null): EventoHistorial {
  return { accion, por: u.nombre, por_id: UUID.test(u.id) ? u.id : null, at: new Date().toISOString(), nota };
}

function error(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Lee y valida los campos de contenido presentes en el body. */
function contenido(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (b.cifras !== undefined) out.cifras = limpiarCifras(b.cifras);
  if (b.separaciones !== undefined) out.separaciones = limpiarSeparaciones(b.separaciones);
  if (b.mora_destacada !== undefined) out.mora_destacada = limpiarMoraDestacada(b.mora_destacada);
  if (b.analisis !== undefined) out.analisis = limpiarTextoLargo(b.analisis);
  if (b.recomendaciones !== undefined) out.recomendaciones = limpiarTextoLargo(b.recomendaciones);
  const adjunto = limpiarAdjunto(b.adjunto);
  if (adjunto !== undefined) out.adjunto = adjunto;
  return out;
}

/** Informe más reciente anterior al periodo (para exigir la justificación de variaciones atípicas). */
async function anteriorA(periodo: string): Promise<{ periodo: string; cifras: CifraProyecto[] } | null> {
  const { data, error: e } = await supabaseAdmin()
    .from("cartera_informes")
    .select("periodo, cifras")
    .lt("periodo", periodo)
    .order("periodo", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e) throw new Error(e.message);
  return data ? { periodo: data.periodo as string, cifras: (data.cifras ?? []) as CifraProyecto[] } : null;
}

async function leerBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const u = await exigirModulo("cartera");
  if (esRespuestaAutorizacion(u)) return u;
  const supa = supabaseAdmin();
  // ?pendientes=1 → consulta ligera para el contador del menú:
  // quien revisa ve los enviados; el equipo de cartera, los devueltos.
  if (req.nextUrl.searchParams.get("pendientes") === "1") {
    const { data, error: e } = await supa
      .from("cartera_informes")
      .select("id, periodo, estado")
      .in("estado", ["enviado", "observado"])
      .order("periodo", { ascending: false });
    if (e) return error(e.message, 500);
    const filas = (data ?? []) as { id: string; periodo: string; estado: EstadoInforme }[];
    const revisa = puedeRevisar(u);
    return NextResponse.json({
      puedeRevisar: revisa,
      porRevisar: revisa ? filas.filter((f) => f.estado === "enviado") : [],
      conObservaciones: filas.filter((f) => f.estado === "observado"),
    });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id !== null) {
    if (!UUID.test(id)) return error("Id inválido");
    const { data, error: e } = await supa.from("cartera_informes").select(`${COLUMNAS_LISTA}, adjunto`).eq("id", id).maybeSingle();
    if (e) return error(e.message, 500);
    if (!data) return error("Informe no encontrado", 404);
    return NextResponse.json({ informe: data });
  }
  const { data, error: e } = await supa.from("cartera_informes").select(COLUMNAS_LISTA).order("periodo", { ascending: false });
  if (e) return error(e.message, 500);
  return NextResponse.json({ informes: data ?? [], puedeRevisar: puedeRevisar(u) });
}

export async function POST(req: NextRequest) {
  const u = await exigirModulo("cartera");
  if (esRespuestaAutorizacion(u)) return u;
  const b = await leerBody(req);
  if (!b) return error("JSON inválido");

  const periodo = periodoDesdeMes(b.periodo);
  if (!periodo) return error("Elige el mes del informe");

  let campos: Record<string, unknown>;
  try {
    campos = contenido(b);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Datos inválidos");
  }

  const historial: EventoHistorial[] = [evento(u, "creado")];
  let estado: EstadoInforme = "borrador";
  if (b.enviar === true) {
    const faltan = faltantesParaEnviar({
      cifras: (campos.cifras as CifraProyecto[] | undefined) ?? [],
      separaciones: (campos.separaciones as SeparacionInforme[] | undefined) ?? [],
      analisis: (campos.analisis as string | null | undefined) ?? null,
    }, await anteriorA(periodo));
    if (faltan.length) return NextResponse.json({ error: "Falta información para enviar a revisión", faltan }, { status: 400 });
    estado = "enviado";
    historial.push(evento(u, "enviado"));
  }

  const supa = supabaseAdmin();
  const { data, error: e } = await supa
    .from("cartera_informes")
    .insert({
      ...campos,
      periodo,
      estado,
      historial,
      creado_por: u.nombre,
      creado_por_id: UUID.test(u.id) ? u.id : null,
      enviado_at: estado === "enviado" ? new Date().toISOString() : null,
    })
    .select(COLUMNAS_LISTA)
    .single();
  if (e) {
    if (e.code === "23505") return error(`Ya existe un informe de ${nombrePeriodo(periodo)}. Ábrelo desde la lista para editarlo.`, 409);
    return error(e.message, 500);
  }
  return NextResponse.json({ ok: true, informe: data });
}

export async function PATCH(req: NextRequest) {
  const u = await exigirModulo("cartera");
  if (esRespuestaAutorizacion(u)) return u;
  const b = await leerBody(req);
  if (!b) return error("JSON inválido");
  if (typeof b.id !== "string" || !UUID.test(b.id)) return error("Id inválido");
  const accion = String(b.accion ?? "guardar");
  const nota = limpiarTextoLargo(b.nota);

  const supa = supabaseAdmin();
  const { data: actual, error: e0 } = await supa
    .from("cartera_informes")
    .select("id, periodo, estado, cifras, separaciones, analisis, historial")
    .eq("id", b.id)
    .maybeSingle();
  if (e0) return error(e0.message, 500);
  if (!actual) return error("Informe no encontrado", 404);
  const estado = actual.estado as EstadoInforme;
  const historial = (Array.isArray(actual.historial) ? actual.historial : []) as EventoHistorial[];
  const patch: Record<string, unknown> = {};

  if (accion === "guardar" || accion === "enviar") {
    if (!EDITABLES.includes(estado)) {
      return error(estado === "aprobado" ? "El informe está aprobado; pide a quien revisa que lo reabra." : "El informe está en revisión; no se puede editar.", 409);
    }
    try {
      Object.assign(patch, contenido(b));
    } catch (e) {
      return error(e instanceof Error ? e.message : "Datos inválidos");
    }
    if (b.periodo !== undefined) {
      const periodo = periodoDesdeMes(b.periodo);
      if (!periodo) return error("Elige el mes del informe");
      patch.periodo = periodo;
    }
    if (accion === "enviar") {
      const faltan = faltantesParaEnviar({
        cifras: (patch.cifras ?? actual.cifras ?? []) as CifraProyecto[],
        separaciones: (patch.separaciones ?? actual.separaciones ?? []) as SeparacionInforme[],
        analisis: (patch.analisis !== undefined ? patch.analisis : actual.analisis) as string | null,
      }, await anteriorA((patch.periodo ?? actual.periodo) as string));
      if (faltan.length) return NextResponse.json({ error: "Falta información para enviar a revisión", faltan }, { status: 400 });
      patch.estado = "enviado";
      patch.enviado_at = new Date().toISOString();
      patch.historial = [...historial, evento(u, "enviado")];
    } else {
      patch.historial = [...historial, evento(u, "guardado")];
    }
  } else if (accion === "aprobar" || accion === "devolver" || accion === "reabrir") {
    if (!puedeRevisar(u)) return error("Tu usuario no tiene permiso para revisar informes de cartera.", 403);
    if (accion === "reabrir") {
      if (estado !== "aprobado") return error("Solo se reabren informes aprobados.", 409);
      if (!nota) return error("Escribe por qué se reabre el informe.");
      patch.estado = "observado";
      patch.observaciones = nota;
      patch.historial = [...historial, evento(u, "reabierto", nota)];
    } else {
      if (estado !== "enviado") return error("Solo se revisan informes enviados a revisión.", 409);
      if (accion === "devolver" && !nota) return error("Escribe las observaciones para quien subió el informe.");
      patch.estado = accion === "aprobar" ? "aprobado" : "observado";
      patch.observaciones = accion === "aprobar" ? null : nota;
      patch.historial = [...historial, evento(u, accion === "aprobar" ? "aprobado" : "devuelto", nota)];
    }
    patch.revisado_por = u.nombre;
    patch.revisado_at = new Date().toISOString();
  } else {
    return error("Acción inválida");
  }

  // Solo actualiza si nadie cambió el estado mientras tanto.
  const { data, error: e } = await supa
    .from("cartera_informes")
    .update(patch)
    .eq("id", b.id)
    .eq("estado", estado)
    .select(COLUMNAS_LISTA)
    .maybeSingle();
  if (e) {
    if (e.code === "23505") return error("Ya existe un informe de ese mes.", 409);
    return error(e.message, 500);
  }
  if (!data) return error("El informe cambió de estado mientras lo editabas. Recarga la lista.", 409);
  return NextResponse.json({ ok: true, informe: data });
}

export async function DELETE(req: NextRequest) {
  const u = await exigirModulo("cartera");
  if (esRespuestaAutorizacion(u)) return u;
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return error("Id inválido");
  const supa = supabaseAdmin();
  const { data, error: e } = await supa.from("cartera_informes").delete().eq("id", id).eq("estado", "borrador").select("id");
  if (e) return error(e.message, 500);
  if (!data?.length) return error("Solo se pueden eliminar informes en borrador.", 409);
  return NextResponse.json({ ok: true });
}
