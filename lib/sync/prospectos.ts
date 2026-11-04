import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bi } from "@/lib/smarthome/client";
import { PROJECTS } from "@/lib/smarthome/projects";
import { mapProspectDetail } from "@/lib/marketing/smarthome";

const ALLOWED = new Set(PROJECTS.map((p) => p.name.trim().toLowerCase()));
const CLAVE_CURSOR = "prospectos_cursor";
const DIAS_RECIENTES = 60;

type Opciones = {
  /** Instante (ms) a partir del cual no se pide otra página. */
  hastaMs: number;
  /** Recorre el histórico entero una vez, desde la página 1 (carga manual, sin límite de 300 s). */
  completo?: boolean;
};

// getProspectDetail son ~67 páginas (unos 18 min), más que los 300 s de una función, y
// ordena de antiguo a nuevo: recorrerlo de corrido nunca llegaba a los prospectos nuevos.
// Por eso: primero lo reciente, de nuevo a antiguo, y con el tiempo sobrante se avanza por
// el histórico guardando la página en mk_sync_estado para seguir en la siguiente corrida.
export async function syncProspectos(supa: SupabaseClient, { hastaMs, completo = false }: Opciones) {
  const errores: string[] = [];
  let filas = 0;

  const subir = async (pagina: unknown[]) => {
    const rows = (pagina as Record<string, unknown>[])
      .filter((r) => ALLOWED.has(String(r.Proyecto ?? "").trim().toLowerCase()))
      .map(mapProspectDetail);
    const unicas = [...new Map(rows.map((r) => [r.prospect_id, r])).values()];
    for (let i = 0; i < unicas.length; i += 500) {
      const lote = unicas.slice(i, i + 500);
      const { error } = await supa.from("sh_prospectos").upsert(lote, { onConflict: "prospect_id" });
      if (error) errores.push(`sh_prospectos: ${error.message}`);
      else filas += lote.length;
    }
  };

  const desde = new Date(Date.now() - DIAS_RECIENTES * 86_400_000).toISOString().slice(0, 10);
  let recientesCompletos = false;
  try {
    const primera = await bi.prospectDetailPage(1, desde);
    const total = primera.pages ?? 1;
    let p = total;
    for (; p >= 2 && Date.now() < hastaMs; p--) await subir((await bi.prospectDetailPage(p, desde)).records ?? []);
    if (p < 2) {
      await subir(primera.records ?? []);
      recientesCompletos = true;
    }
  } catch (e) {
    errores.push(`recientes: ${String(e)}`);
  }

  let pagina = 1;
  let paginasHistorico = 0;
  try {
    if (!completo) {
      const { data } = await supa.from("mk_sync_estado").select("detalle").eq("clave", CLAVE_CURSOR).maybeSingle();
      pagina = Number((data?.detalle as { pagina?: number } | null)?.pagina) || 1;
    }
    while (completo || Date.now() < hastaMs) {
      const res = await bi.prospectDetailPage(pagina, "2015-01-01");
      await subir(res.records ?? []);
      paginasHistorico++;
      const total = res.pages ?? 1;
      pagina = pagina >= total ? 1 : pagina + 1;
      await supa.from("mk_sync_estado").upsert(
        { clave: CLAVE_CURSOR, ultimo_ok: new Date().toISOString(), detalle: { pagina, total } },
        { onConflict: "clave" },
      );
      if (paginasHistorico >= total) break; // una sola vuelta por corrida
    }
  } catch (e) {
    errores.push(`historico: ${String(e)}`);
  }

  return { filas, recientesCompletos, paginasHistorico, siguientePagina: pagina, errores };
}
