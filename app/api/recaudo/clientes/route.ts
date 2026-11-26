import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirModulo, esRespuestaAutorizacion } from "@/lib/auth/servidor";
import { esConcepto, recaudoPorCliente, tendenciaMensual, type AbonoRec, type ClienteRec, type CuotaRec } from "@/lib/recaudo/clientes";

// GET /api/recaudo/clientes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&concepto=inicial|credito|otros|todo
// Recaudo por cliente calculado cuota por cuota (cada pago se aplica a la cuota que
// paga). «desde» es opcional (sin límite inferior); «hasta» es obligatorio.
// También devuelve la tendencia de los 12 meses que terminan en el mes de «hasta».
// Módulo «recaudo». Usa los datos ya sincronizados de Smarthome.

const PAGINA = 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

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
  const u = await exigirModulo("recaudo");
  if (esRespuestaAutorizacion(u)) return u;
  const q = req.nextUrl.searchParams;
  const desde = q.get("desde") || null;
  const hasta = q.get("hasta") ?? "";
  const concepto = q.get("concepto") ?? "inicial";
  if ((desde !== null && !FECHA.test(desde)) || !FECHA.test(hasta) || (desde !== null && desde > hasta)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  if (!esConcepto(concepto)) return NextResponse.json({ error: "Concepto inválido" }, { status: 400 });

  const supa = supabaseAdmin();
  try {
    const [cuotas, abonos, cartera] = await Promise.all([
      todas<CuotaRec>((d, h) => supa.from("sh_cuotas").select("payment_id, prospect_id, project_name, fecha, tipo, programado").order("payment_id").range(d, h)),
      todas<AbonoRec>((d, h) => supa.from("sh_abonos").select("id, prospect_id, fecha, monto").order("id").range(d, h)),
      todas<{ prospect_id: string; cliente: string | null; module: string | null }>((d, h) => supa.from("cartera").select("prospect_id, cliente, module").order("prospect_id").range(d, h)),
    ]);
    const clientes = new Map<string, ClienteRec>(cartera.map((c) => [c.prospect_id, { cliente: c.cliente, module: c.module }]));
    return NextResponse.json({
      filas: recaudoPorCliente({ desde, hasta, concepto }, cuotas, abonos, clientes),
      tendencia: tendenciaMensual(hasta.slice(0, 7), 12, concepto, cuotas, abonos),
    });
  } catch (e) {
    console.error("GET /api/recaudo/clientes", e);
    return NextResponse.json({ error: "No se pudo calcular el recaudo por cliente" }, { status: 500 });
  }
}
