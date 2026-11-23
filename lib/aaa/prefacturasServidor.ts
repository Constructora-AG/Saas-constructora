// Carga (servidor) de las prefacturas de UN contrato y de sus listas maestras.
import "server-only";
import type { PrefacturaRow } from "@/lib/aaa/catalogo";
import { DEMO_PREFACTURAS, supabaseConfigured } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/server";
import { KEY_CONTRATOS, type ContratoDinamico } from "@/lib/transporte/constants";

export interface Maestros { areas: string[]; interventores: string[] }

function leerMaestros(raw: unknown): Maestros | null {
  try {
    const adm = raw ? (JSON.parse(String(raw)) as { areas?: unknown; interventores?: unknown }) : null;
    if (!adm) return null;
    const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter(Boolean) : []);
    return { areas: lista(adm.areas), interventores: lista(adm.interventores) };
  } catch {
    return null;
  }
}

export async function cargarPrefacturasContrato(contrato: string): Promise<{
  prefacturas: PrefacturaRow[];
  maestros: Maestros;
  loadError: string | null;
  demo: boolean;
}> {
  if (!supabaseConfigured()) {
    return {
      prefacturas: (DEMO_PREFACTURAS as PrefacturaRow[]).filter((p) => p.contrato === contrato),
      maestros: { areas: [], interventores: [] },
      loadError: null,
      demo: true,
    };
  }
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("aaa_prefacturas")
    .select("*")
    .eq("contrato", contrato)
    .order("fecha_generacion", { ascending: false });
  // Listas maestras: las del propio contrato; si están vacías, las de Transporte AAA.
  const propia = contrato === "transporte" ? "adminconfig" : `${contrato}:adminconfig`;
  const { data: kv } = await supa.from("transporte_kv").select("key,value").in("key", [propia, "adminconfig"]);
  const delContrato = leerMaestros(kv?.find((r) => r.key === propia)?.value);
  const global = leerMaestros(kv?.find((r) => r.key === "adminconfig")?.value) ?? { areas: [], interventores: [] };
  const maestros = {
    areas: delContrato?.areas.length ? delContrato.areas : global.areas,
    interventores: delContrato?.interventores.length ? delContrato.interventores : global.interventores,
  };
  return { prefacturas: (data ?? []) as PrefacturaRow[], maestros, loadError: error?.message ?? null, demo: false };
}

/** Contratos creados en la app (clave global "contratos" de transporte_kv). */
export async function cargarContratosServidor(): Promise<ContratoDinamico[]> {
  if (!supabaseConfigured()) return [];
  const { data } = await supabaseAdmin().from("transporte_kv").select("value").eq("key", KEY_CONTRATOS).maybeSingle();
  try {
    const arr = data?.value ? JSON.parse(String(data.value)) : [];
    return Array.isArray(arr) ? (arr as ContratoDinamico[]) : [];
  } catch {
    return [];
  }
}
