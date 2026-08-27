import { NextRequest, NextResponse } from "next/server";
import { rest } from "@/lib/smarthome/client";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

// POST/GET /api/cuotas/sync?secret=...  (opcional &project=CODE)
// Guarda el detalle del plan de pagos (cada cuota: fecha, programado, pagado) por proyecto.
// Base del módulo de recaudo por proyecto.
async function handler(req: NextRequest) {
  const secret = process.env.CARTERA_SYNC_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? req.nextUrl.searchParams.get("secret");
  if (secret && !isVercelCron && auth !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supa = supabaseAdmin();
  const onlyProject = req.nextUrl.searchParams.get("project");
  let q = supa.from("cartera").select("prospect_id, project_code, project_name");
  if (onlyProject) q = q.eq("project_code", onlyProject);
  const { data: cart } = await q;
  const clientes = (cart ?? []) as Array<{ prospect_id: string; project_code: string; project_name: string }>;

  let cuotas = 0;
  let abonos = 0;
  const errors: string[] = [];
  const BATCH = 6;
  for (let i = 0; i < clientes.length; i += BATCH) {
    const slice = clientes.slice(i, i + BATCH);
    const lotes = await Promise.all(slice.map(async (cl) => {
      if (!cl.project_code) return { cuotas: [] as any[], abonos: [] as any[] };
      try {
        const plan = await rest.getPaymentSummary(cl.project_code, cl.prospect_id);
        const cuotasRows: any[] = [];
        const abonosRows: any[] = [];
        plan.forEach((it: any, idx: number) => {
          const tipo = typeof it.paymentType === "number" ? it.paymentType : Number(it.paymentType) || 0;
          const pid = String(it.paymentId ?? `${cl.prospect_id}-${idx}`);
          const pagado = (it.payments ?? []).reduce((s: number, p: any) => s + (p.amountValue ?? 0), 0);
          cuotasRows.push({
            payment_id: pid, prospect_id: cl.prospect_id, project_code: cl.project_code, project_name: cl.project_name,
            fecha: it.date ? String(it.date).slice(0, 10) : null, tipo, programado: it.scheduledPaymentAmountValue ?? 0, pagado,
          });
          (it.payments ?? []).forEach((p: any, pi: number) => {
            if (!p.date || !(p.amountValue > 0)) return;
            abonosRows.push({
              id: `${pid}-${p.paymentId ?? pi}`, prospect_id: cl.prospect_id, project_code: cl.project_code,
              project_name: cl.project_name, tipo, fecha: String(p.date).slice(0, 10), monto: p.amountValue ?? 0,
            });
          });
        });
        return { cuotas: cuotasRows, abonos: abonosRows };
      } catch (e) {
        errors.push(`${cl.prospect_id}: ${String(e)}`);
        return { cuotas: [], abonos: [] };
      }
    }));
    const cRows = lotes.flatMap((l) => l.cuotas);
    const aRows = lotes.flatMap((l) => l.abonos);
    for (let j = 0; j < cRows.length; j += 500) {
      const { error } = await supa.from("sh_cuotas").upsert(cRows.slice(j, j + 500), { onConflict: "payment_id" });
      if (error) errors.push(`cuotas: ${error.message}`); else cuotas += Math.min(500, cRows.length - j);
    }
    for (let j = 0; j < aRows.length; j += 500) {
      const { error } = await supa.from("sh_abonos").upsert(aRows.slice(j, j + 500), { onConflict: "id" });
      if (error) errors.push(`abonos: ${error.message}`); else abonos += Math.min(500, aRows.length - j);
    }
  }

  return NextResponse.json({ ok: true, clientes: clientes.length, cuotas, abonos, errores: errors.slice(0, 15) });
}

export const GET = handler;
export const POST = handler;
