import { NextRequest, NextResponse } from "next/server";
import { rest } from "@/lib/smarthome/client";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

// Extrae el monto de textos tipo "Pago cuota 22. Recibo de caja No. 1373. Valor $600,000.00."
// Formato US: coma = miles, punto = decimal. Ignora el punto final de la frase.
function parseMonto(txt: string): number | null {
  const m = txt.match(/\$\s*([\d.,]+)/);
  if (!m) return null;
  const sinMiles = m[1].replace(/,/g, "");        // "600000.00." | "500000."
  const num = sinMiles.match(/^\d+(?:\.\d+)?/);    // "600000.00" | "500000"
  if (!num) return null;
  const n = Number(num[0]);
  return Number.isFinite(n) ? n : null;
}

// Nº de recibo: "Recibo de caja [parcial] No. 1384" → "1384" (para contar recibos distintos).
function parseRecibo(txt: string): string | null {
  const m = txt.match(/recibo de caja(?:\s+parcial)?\s+no\.?\s*(\d+)/i);
  return m ? m[1] : null;
}

// POST /api/eventos/sync?secret=...  (opcional &project=CODE)
// Trae la bitácora real (getProspectEvents) de cada cliente de cartera a Supabase.
async function handler(req: NextRequest) {
  const secret = process.env.CARTERA_SYNC_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? req.nextUrl.searchParams.get("secret");
  if (secret && !isVercelCron && auth !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supa = supabaseAdmin();

  // Mapa userId -> nombre.
  const userMap = new Map<string, string>();
  try {
    for (const u of await rest.getUsers()) userMap.set(u.userId, `${(u.firstName || "").trim()} ${(u.lastName || "").trim()}`.trim());
  } catch { /* seguimos sin nombres */ }

  // Clientes de cartera (fuente de prospectos a recorrer).
  const onlyProject = req.nextUrl.searchParams.get("project");
  let q = supa.from("cartera").select("prospect_id, project_code, cliente, module");
  if (onlyProject) q = q.eq("project_code", onlyProject);
  const { data: cart } = await q;
  const clientes = (cart ?? []) as Array<{ prospect_id: string; project_code: string; cliente: string; module: string }>;

  let eventos = 0;
  const errors: string[] = [];
  const BATCH = 6;
  for (let i = 0; i < clientes.length; i += BATCH) {
    const slice = clientes.slice(i, i + BATCH);
    const lotes = await Promise.all(slice.map(async (cl) => {
      if (!cl.project_code) return [];
      try {
        const ev = await rest.getProspectEvents(cl.project_code, cl.prospect_id);
        return ev.map((e: any) => {
          const contenido = (e.content ?? "").toString().trim();
          const esPago = /recibo de caja/i.test(contenido) || /^abono/i.test(contenido);
          return {
            event_id: String(e.eventId ?? `${cl.prospect_id}-${e.index ?? e.date}`),
            prospect_id: cl.prospect_id,
            cliente: cl.cliente,
            module: cl.module,
            project_code: cl.project_code,
            usuario: userMap.get(e.userId) ?? "",
            fecha: e.date || null,
            tipo: typeof e.eventType === "number" ? e.eventType : Number(e.eventType) || 0,
            contenido,
            es_pago: esPago,
            monto: esPago ? parseMonto(contenido) : null,
            recibo: esPago ? parseRecibo(contenido) : null,
          };
        });
      } catch (err) {
        errors.push(`${cl.prospect_id}: ${String(err)}`);
        return [];
      }
    }));
    const rows = lotes.flat();
    for (let j = 0; j < rows.length; j += 500) {
      const { error } = await supa.from("sh_eventos").upsert(rows.slice(j, j + 500), { onConflict: "event_id" });
      if (error) errors.push(`upsert: ${error.message}`);
      else eventos += Math.min(500, rows.length - j);
    }
  }

  return NextResponse.json({ ok: true, clientes: clientes.length, eventos, errores: errors.slice(0, 15) });
}

export const GET = handler;
export const POST = handler;
