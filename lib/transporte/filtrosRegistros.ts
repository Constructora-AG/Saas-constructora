// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Filtros generales de la vista Registros
// Cada filtro es una entrada de FILTROS_REGISTROS: para agregar uno
// nuevo basta con declarar cómo se lee su valor en el Servicio.
// Lógica pura (sin React) para poder probarla con node --test.
// ════════════════════════════════════════════════════════════════════

import type { Servicio } from "./model";
import { areaAAADe } from "./model";

export interface FiltroDef {
  id: string;
  label: string;
  /** Valor del servicio para este filtro; "" = sin dato. */
  valor: (s: Servicio) => string;
  /** Etiqueta de la opción para los servicios sin dato. */
  vacio: string;
}

/** Valores elegidos por filtro (id → valor). Ausente o "" = todos. */
export type FiltrosActivos = Record<string, string>;

export interface OpcionFiltro {
  valor: string;
  label: string;
  cantidad: number;
}

/** Valor de la opción «sin dato» (ningún valor real se llama así). */
export const SIN_DATO = "__sin_dato__";

export const FILTROS_REGISTROS: ReadonlyArray<FiltroDef> = [
  { id: "area", label: "Área AAA", valor: (s) => areaAAADe(s), vacio: "Sin área AAA" },
  { id: "tipo", label: "Tipo de servicio", valor: (s) => String(s.serviceType ?? ""), vacio: "Sin tipo" },
  { id: "placa", label: "Placa", valor: (s) => s.plate ?? "", vacio: "Sin placa" },
  { id: "conductor", label: "Conductor", valor: (s) => s.driver ?? "", vacio: "Sin conductor" },
  { id: "interventor", label: "Interventor", valor: (s) => s.interventor ?? "", vacio: "Sin interventor" },
  { id: "prefactura", label: "Prefactura", valor: (s) => (s.prefactura ? "Prefacturado" : "Sin prefacturar"), vacio: "" },
];

const claveDe = (f: FiltroDef, s: Servicio) => f.valor(s).trim() || SIN_DATO;

function cumple(s: Servicio, filtros: ReadonlyArray<FiltroDef>, activos: FiltrosActivos, excepto?: string): boolean {
  return filtros.every((f) => f.id === excepto || !activos[f.id] || claveDe(f, s) === activos[f.id]);
}

/** Servicios que cumplen todos los filtros activos. */
export function aplicarFiltros(items: Servicio[], activos: FiltrosActivos, filtros = FILTROS_REGISTROS): Servicio[] {
  return items.filter((s) => cumple(s, filtros, activos));
}

/**
 * Opciones de un filtro con su cantidad, contando solo los servicios que
 * cumplen los DEMÁS filtros activos (así no se ofrecen combinaciones vacías).
 * Orden alfabético en español, con la opción «sin dato» al final.
 */
export function opcionesFiltro(items: Servicio[], filtro: FiltroDef, activos: FiltrosActivos, filtros = FILTROS_REGISTROS): OpcionFiltro[] {
  const conteo = new Map<string, number>();
  items.forEach((s) => {
    if (!cumple(s, filtros, activos, filtro.id)) return;
    const k = claveDe(filtro, s);
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  });
  // La opción elegida siempre aparece (con 0) para que el select no muestre «Todos» con un filtro aplicado.
  const elegido = activos[filtro.id];
  if (elegido && !conteo.has(elegido)) conteo.set(elegido, 0);
  return [...conteo.entries()]
    .map(([valor, cantidad]) => ({ valor, cantidad, label: valor === SIN_DATO ? filtro.vacio : valor }))
    .sort((a, b) => (a.valor === SIN_DATO ? 1 : b.valor === SIN_DATO ? -1 : a.label.localeCompare(b.label, "es")));
}

/**
 * Descarta los filtros cuyo valor no existe entre los servicios (p. ej. al
 * cambiar de mes) para que nunca quede un filtro invisible vaciando la tabla.
 */
export function filtrosVigentes(items: Servicio[], activos: FiltrosActivos, filtros = FILTROS_REGISTROS): FiltrosActivos {
  const out: FiltrosActivos = {};
  filtros.forEach((f) => {
    const v = activos[f.id];
    if (v && items.some((s) => claveDe(f, s) === v)) out[f.id] = v;
  });
  return out;
}

/** Etiquetas legibles de los filtros activos, en el orden de FILTROS_REGISTROS. */
export function etiquetasActivas(activos: FiltrosActivos, filtros = FILTROS_REGISTROS): string[] {
  return filtros.filter((f) => activos[f.id]).map((f) => (activos[f.id] === SIN_DATO ? f.vacio : activos[f.id]));
}
