import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirModulo, esRespuestaAutorizacion } from "@/lib/auth/servidor";
import { periodoDesdeMes, type CifraProyecto, type SeparacionInforme } from "@/lib/cartera/informes";
import {
  calcularReferenciaLotes,
  pistaDiferencia,
  type AbonoSH,
  type ClienteSH,
  type ComparacionSmarthome,
  type CuotaSH,
} from "@/lib/cartera/referenciaSmarthome";

// GET /api/cartera/informes/referencia?periodo=YYYY-MM  → un mes (vista del informe)
// GET /api/cartera/informes/referencia?anio=YYYY        → los 12 meses (cuadro anual)
// Referencia Smarthome (solo lectura) para revisar informes: recaudo real y
// separaciones de Lotes Reserva del Manantial, diferencia contra el informe y
// posible causa. Solo quien tiene «cartera_revision». Usa los datos ya sincronizados.

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

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Primer día del mes desplazado `n` meses y último día del mes desplazado `m` meses. */
const desde = (anio: number, mes: number, n: number) => iso(new Date(Date.UTC(anio, mes - 1 + n, 1)));
const hasta = (anio: number, mes: number, m: number) => iso(new Date(Date.UTC(anio, mes + m, 0)));

/** Recaudo real de Lotes en un informe (pagado − separaciones); null si el informe no tiene Lotes. */
function realInforme(cifras: CifraProyecto[], separaciones: SeparacionInforme[]): number | null {
  const c = cifras.find((x) => x.proyecto === "lotes_manantial");
  if (!c) return null;
  return c.recaudo_pagado - separaciones.filter((s) => s.proyecto === "lotes_manantial").reduce((t, s) => t + s.valor, 0);
}

export async function GET(req: NextRequest) {
  const u = await exigirModulo("cartera_revision");
  if (esRespuestaAutorizacion(u)) return u;
  const supa = supabaseAdmin();
  const anioParam = req.nextUrl.searchParams.get("anio");
  const periodo = anioParam === null ? periodoDesdeMes(req.nextUrl.searchParams.get("periodo")) : null;
  const anioN = anioParam !== null ? Number(anioParam) : periodo ? Number(periodo.slice(0, 4)) : NaN;
  if (anioParam !== null ? !/^\d{4}$/.test(anioParam) || anioN < 2020 || anioN > 2100 : !periodo) {
    return NextResponse.json({ error: anioParam !== null ? "Año inválido" : "Periodo inválido" }, { status: 400 });
  }
  // Rango de abonos: el mes (o año) más un mes antes y uno después, para las pistas.
  const [ini, fin] = periodo
    ? [desde(anioN, Number(periodo.slice(5, 7)), -1), hasta(anioN, Number(periodo.slice(5, 7)), 1)]
    : [desde(anioN, 1, -1), hasta(anioN, 12, 1)];

  try {
    const [cuotas, abonos, carteraLotes, informes] = await Promise.all([
      todas<CuotaSH>((d, h) => supa.from("sh_cuotas").select("payment_id, prospect_id, fecha, tipo").ilike("project_name", LOTES).order("payment_id").range(d, h)),
      todas<AbonoSH>((d, h) => supa.from("sh_abonos").select("id, prospect_id, fecha, monto").ilike("project_name", LOTES).gte("fecha", ini).lte("fecha", fin).order("id").range(d, h)),
      todas<{ prospect_id: string; cliente: string | null; module: string | null }>((d, h) => supa.from("cartera").select("prospect_id, cliente, module").ilike("project_name", LOTES).order("prospect_id").range(d, h)),
      todas<{ periodo: string; cifras: CifraProyecto[]; separaciones: SeparacionInforme[] }>((d, h) => {
        const q = supa.from("cartera_informes").select("periodo, cifras, separaciones");
        return (periodo ? q.eq("periodo", periodo) : q.gte("periodo", `${anioN}-01-01`).lte("periodo", `${anioN}-12-01`)).order("periodo").range(d, h);
      }),
    ]);
    const clientes = new Map<string, ClienteSH>(carteraLotes.map((c) => [c.prospect_id, { cliente: c.cliente, module: c.module }]));
    const { data: sync } = await supa.from("sh_abonos").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle();
    const sincronizado = (sync?.synced_at as string | undefined) ?? null;

    const comparar = (p: string, recaudoReal: number): ComparacionSmarthome => {
      const inf = informes.find((i) => i.periodo === p);
      const informeReal = inf ? realInforme(inf.cifras ?? [], inf.separaciones ?? []) : null;
      const diferencia = informeReal === null ? null : recaudoReal - informeReal;
      return { informeReal, diferencia, pista: diferencia === null ? null : pistaDiferencia(p, diferencia, cuotas, abonos, clientes) };
    };

    if (periodo) {
      const lotes = calcularReferenciaLotes(periodo, cuotas, abonos, clientes);
      return NextResponse.json({ periodo, sincronizado, lotes, comparacion: comparar(periodo, lotes.recaudoReal) });
    }
    const meses = Array.from({ length: 12 }, (_, k) => {
      const p = `${anioN}-${String(k + 1).padStart(2, "0")}-01`;
      const { separaciones, ...totales } = calcularReferenciaLotes(p, cuotas, abonos, clientes);
      return { periodo: p, ...totales, nSeparaciones: separaciones.length, ...comparar(p, totales.recaudoReal) };
    });
    return NextResponse.json({ anio: anioN, sincronizado, meses });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo consultar Smarthome" }, { status: 500 });
  }
}
