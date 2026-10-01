// ════════════════════════════════════════════════════════════════════
// Contratos creados desde la app (Proyecto Triple A → Contratos).
// La lista vive en la clave global "contratos" de transporte_kv; cada contrato
// usa su propio espacio de datos "<id>:" (registros, tarifario, administración)
// con el mismo motor que Contrato de Alquiler. Nunca se mezcla con otros módulos.
// ════════════════════════════════════════════════════════════════════

import { KEY_CONTRATOS, NS_RESERVADOS, PREFIJOS_RESERVADOS, type ContratoDinamico } from "./constants";
import { storageFor } from "./storage";

const st = () => storageFor("transporte"); // clave global, sin prefijo de módulo

export async function cargarContratos(): Promise<ContratoDinamico[]> {
  const raw = await st().kvGet(KEY_CONTRATOS);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ContratoDinamico[]) : [];
  } catch {
    return [];
  }
}

export async function guardarContratos(lista: ContratoDinamico[]): Promise<void> {
  await st().kvSet(KEY_CONTRATOS, JSON.stringify(lista));
}

/** Identificador (espacio de datos y ruta) a partir del nombre: minúsculas, sin tildes, con guiones. */
export function idContrato(nombre: string, existentes: string[]): string {
  const base = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/^contrato\s+(de\s+)?/, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40) || "contrato";
  let id = base;
  let n = 2;
  while (NS_RESERVADOS.includes(id) || existentes.includes(id)) id = `${base}-${n++}`;
  return id;
}

/** Prefijo de órdenes sugerido (2 letras) que no choque con TP / AL / EM / PF ni con otros contratos. */
export function prefijoSugerido(nombre: string, usados: string[]): string {
  const palabras = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/^CONTRATO\s+(DE\s+)?/, "")
    .split(/[^A-Z]+/).filter((w) => w.length > 2);
  const ocupado = (p: string) => PREFIJOS_RESERVADOS.includes(p) || usados.includes(p);
  const candidatos = [
    palabras.length > 1 ? palabras[0][0] + palabras[1][0] : "",
    (palabras[0] ?? "").slice(0, 2),
    ...(palabras[0] ?? "").slice(1).split("").map((c) => (palabras[0] ?? "X")[0] + c),
  ].filter((p) => /^[A-Z]{2}$/.test(p));
  return candidatos.find((p) => !ocupado(p)) ?? "CT";
}
