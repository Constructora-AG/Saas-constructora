import { NextRequest, NextResponse } from "next/server";
import { syncAutorizado } from "@/lib/sync/auth";
import { rest } from "@/lib/smarthome/client";
import { PROJECTS } from "@/lib/smarthome/projects";
import { computeCartera } from "@/lib/cartera/compute";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300; // sync puede tardar; Fluid Compute lo permite

// POST/GET /api/cartera/sync?projectCode=3e7aa5be
// Refresca el snapshot de cartera desde Smarthome hacia Supabase.
// Protegido por CARTERA_SYNC_SECRET (header Authorization: Bearer <secret> o ?secret=).
async function handler(req: NextRequest) {
  if (!syncAutorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const only = req.nextUrl.searchParams.get("projectCode");
  const projects = PROJECTS.filter((p) => p.code && (!only || p.code === only));
  const supa = supabaseAdmin();

  // Nombres de respaldo (empresas, que getCustomerDetail deja en blanco). Antes se descargaba
  // todo el histórico de la BI aquí, y eso agotaba los 300 s antes de escribir la cartera.
  const nombresDe = async (tabla: "sh_prospectos" | "cartera", columna: "nombre" | "cliente", ids: string[]) => {
    const m = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supa.from(tabla).select(`prospect_id, ${columna}`).in("prospect_id", ids.slice(i, i + 200));
      for (const r of (data ?? []) as unknown as Array<Record<string, string | null>>) {
        const n = (r[columna] ?? "").trim();
        if (r.prospect_id && n) m.set(r.prospect_id, n);
      }
    }
    return m;
  };

  let upserted = 0;
  const errors: string[] = [];

  for (const project of projects) {
    const code = project.code!;
    let sales: Awaited<ReturnType<typeof rest.getSales>>;
    try {
      sales = await rest.getSales(code);
    } catch (e) {
      errors.push(`getSales ${code}: ${String(e)}`);
      continue;
    }
    const ids = sales.map((v) => v.prospectId);
    const biNames = await nombresDe("sh_prospectos", "nombre", ids);
    const nombresPrevios = await nombresDe("cartera", "cliente", ids);

    // Procesa en lotes para no saturar la API.
    const BATCH = 5;
    for (let i = 0; i < sales.length; i += BATCH) {
      const slice = sales.slice(i, i + BATCH);
      const rows = await Promise.all(
        slice.map(async (sale) => {
          try {
            const [plan, detail] = await Promise.all([
              rest.getPaymentSummary(code, sale.prospectId),
              rest.getCustomerDetail(code, sale.prospectId).catch(() => undefined),
            ]);
            const c = computeCartera(plan);
            const nombreRest = detail ? `${detail.firstName ?? ""} ${detail.lastName ?? ""}`.trim() : "";
            const cliente = nombreRest || biNames.get(sale.prospectId) || nombresPrevios.get(sale.prospectId) || sale.module;
            const celular =
              detail?.mobileNumber || detail?.secondPhoneNumber || detail?.phoneNumber || "";
            return {
              prospect_id: sale.prospectId,
              customer_id: sale.customerId,
              project_code: code,
              project_name: sale.project?.trim() ?? project.name,
              module: sale.module,
              cliente,
              identificacion: detail?.identificationNumber ?? "",
              celular,
              email: detail?.email ?? "",
              total_valor: sale.totalValue ?? 0,
              total_programado: c.totalProgramado,
              total_pagado: c.totalPagado,
              saldo: c.saldo,
              saldo_inicial: c.saldoInicial,
              saldo_credito: c.saldoCredito,
              cuotas_vencidas: c.cuotasVencidas,
              cuotas_pagadas: c.cuotasPagadas,
              cuotas_por_vencer: c.cuotasPorVencer,
              cuotas_total: c.cuotasTotal,
              monto_en_mora: c.montoEnMora,
              mora_inicial: c.moraInicial,
              mora_credito: c.moraCredito,
              dias_mora: c.diasMora,
              semaforo: c.semaforo,
              proxima_cuota_fecha: c.proximaCuotaFecha,
              proxima_cuota_valor: c.proximaCuotaValor,
              synced_at: new Date().toISOString(),
            };
          } catch (e) {
            errors.push(`${code}/${sale.prospectId}: ${String(e)}`);
            return null;
          }
        }),
      );

      const valid = rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[];
      if (valid.length) {
        const { error } = await supa.from("cartera").upsert(valid, { onConflict: "prospect_id" });
        if (error) errors.push(`upsert: ${error.message}`);
        else upserted += valid.length;
      }
    }
  }

  // Rellena nombres de empresas/faltantes por NIT desde el apto hermano.
  try { await supa.rpc("backfill_nombres"); } catch { /* opcional */ }

  return NextResponse.json({
    ok: true,
    proyectos: projects.length,
    cartera_actualizada: upserted,
    errores: errors.slice(0, 20),
  });
}

export const GET = handler;
export const POST = handler;
