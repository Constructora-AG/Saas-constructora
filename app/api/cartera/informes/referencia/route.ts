import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirModulo, esRespuestaAutorizacion } from "@/lib/auth/servidor";
import { periodoDesdeMes } from "@/lib/cartera/informes";
import { calcularReferenciaLotes, type AbonoSH, type ClienteSH, type CuotaSH } from "@/lib/cartera/referenciaSmarthome";

// GET /api/cartera/informes/referencia?periodo=YYYY-MM  → un mes (vista del informe)
// GET /api/cartera/informes/referencia?anio=YYYY        → los 12 meses (cuadro anual)
// Referencia Smarthome (solo lectura) para revisar informes: recaudo real y
// separaciones de Lotes Reserva del Manantial. Solo quien tiene «cartera_revision».
// Usa los datos ya sincronizados (sh_cuotas, sh_abonos, cartera).

const PAGINA = 1000;
const LOTES = "%manantial%";

/** Lee todas las filas paginando (PostgREST devuelve máximo 1000 por consulta). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

export async function GET(req: NextRequest) {
  const u = await exigirModulo("cartera_revision");
  if (esRespuestaAutorizacion(u)) return u;
  const anioParam = req.nextUrl.searchParams.get("anio");
  const supa = supabaseAdmin();
  const sincronizado = async () => {
    const { data: sync } = await supa.from("sh_abonos").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle();
    return (sync?.synced_at as string | undefined) ?? null;
  };

  // ── Año completo (cuadro anual): solo totales por mes ──
  if (anioParam !== null) {
    const anioN = Number(anioParam);
    if (!/^\d{4}$/.test(anioParam) || anioN < 2020 || anioN > 2100) return NextResponse.json({ error: "Año inválido" }, { status: 400 });
    try {
      const [cuotas, abonos] = await Promise.all([
        todas<CuotaSH>((d, h) => supa.from("sh_cuotas").select("payment_id, prospect_id, fecha, tipo").ilike("project_name", LOTES).order("payment_id").range(d, h)),
        todas<AbonoSH>((d, h) => supa.from("sh_abonos").select("id, prospect_id, fecha, monto").ilike("project_name", LOTES).gte("fecha", `${anioN}-01-01`).lte("fecha", `${anioN}-12-31`).order("id").range(d, h)),
      ]);
      const sinNombres = new Map<string, ClienteSH>();
      const meses = Array.from({ length: 12 }, (_, k) => {
        const p = `${anioN}-${String(k + 1).padStart(2, "0")}-01`;
        const { separaciones, ...totales } = calcularReferenciaLotes(p, cuotas, abonos, sinNombres);
        return { periodo: p, ...totales, nSeparaciones: separaciones.length };
      });
      return NextResponse.json({ anio: anioN, sincronizado: await sincronizado(), meses });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo consultar Smarthome" }, { status: 500 });
    }
  }

  // ── Un mes (vista del informe) ──
  const periodo = periodoDesdeMes(req.nextUrl.searchParams.get("periodo"));
  if (!periodo) return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });
  const [anio, mes] = periodo.split("-").map(Number);
  const fin = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10); // último día del mes

  try {
    const [cuotas, abonos] = await Promise.all([
      todas<CuotaSH>((d, h) => supa.from("sh_cuotas").select("payment_id, prospect_id, fecha, tipo").ilike("project_name", LOTES).order("payment_id").range(d, h)),
      todas<AbonoSH>((d, h) => supa.from("sh_abonos").select("id, prospect_id, fecha, monto").ilike("project_name", LOTES).gte("fecha", periodo).lte("fecha", fin).order("id").range(d, h)),
    ]);
    const ids = [...new Set(abonos.map((a) => a.prospect_id))];
    const clientes = new Map<string, ClienteSH>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supa.from("cartera").select("prospect_id, cliente, module").in("prospect_id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const c of data ?? []) clientes.set(c.prospect_id as string, { cliente: c.cliente as string | null, module: c.module as string | null });
    }
    return NextResponse.json({
      periodo,
      sincronizado: await sincronizado(),
      lotes: calcularReferenciaLotes(periodo, cuotas, abonos, clientes),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo consultar Smarthome" }, { status: 500 });
  }
}
