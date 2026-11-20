import { catalogoDe } from "@/lib/aaa/catalogo";

export interface ItemBody {
  item?: unknown;
  cantidad?: unknown;
  vr_unit?: unknown;
  maquina?: unknown;
  unidad?: unknown;
  iva_pct?: unknown;
}

export interface AdjuntoBody {
  name?: unknown;
  type?: unknown;
  dataUrl?: unknown;
}

export interface AdjuntoLimpio {
  name: string;
  type: string;
  dataUrl: string;
}

export const ESTADOS_PREFACTURA = new Set([
  "pendiente_acta_migo",
  "por_facturar",
  "pendiente_pago",
  "pagada",
  "rechazada",
]);

const MAX_ADJUNTO = 6 * 1024 * 1024;

/** Contrato de prefactura: módulos base o contratos creados en la app. */
export function contratoValido(c: unknown): c is string {
  return typeof c === "string" &&
    (c === "alquiler" || c === "emergencia" || c === "transporte" || /^[a-z0-9][a-z0-9-]{1,40}$/.test(c));
}

export function limpiarAdjunto(v: unknown): AdjuntoLimpio | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const a = v as AdjuntoBody;
  const dataUrl = String(a.dataUrl ?? "");
  if (!/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(dataUrl)) throw new Error("Adjunto inválido");
  if (dataUrl.length > MAX_ADJUNTO) throw new Error("El archivo supera el tamaño máximo (~4 MB)");
  return { name: String(a.name ?? "archivo"), type: String(a.type ?? "application/octet-stream"), dataUrl };
}

/** Fecha ISO + 30 días calendario (vencimiento de la prefactura). */
export function mas30Dias(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3] + 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function periodoTexto(desde: unknown, hasta: unknown, fallback: unknown): string | null {
  const f = (s: unknown) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
    if (!m) return null;
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${m[3]} ${meses[+m[2] - 1]} ${m[1]}`;
  };
  const a = f(desde), b = f(hasta);
  if (a && b) return a === b ? a : `${a} al ${b}`;
  if (a) return `desde ${a}`;
  if (b) return `hasta ${b}`;
  return fallback ? String(fallback) : null;
}

/** Valida y normaliza los ítems exactamente como la ruta de prefacturas. */
export function validarItems(
  contrato: string,
  rawItems: ItemBody[],
  libres = false,
): { items: Array<Record<string, unknown>>; valorBase: number } | { error: string } {
  if (rawItems.length === 0) return { error: "La prefactura necesita al menos un ítem" };
  if (contrato === "transporte" || libres || (contrato !== "alquiler" && contrato !== "emergencia")) {
    const items: Array<Record<string, unknown>> = [];
    for (const it of rawItems as Array<ItemBody & { maquina?: unknown; unidad?: unknown }>) {
      const nombre = String(it.item ?? "").trim();
      if (!nombre) return { error: "Ítem sin descripción" };
      const cantidad = Number(it.cantidad);
      const vrUnit = Number(it.vr_unit);
      if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: `Cantidad inválida en "${nombre}"` };
      if (!Number.isFinite(vrUnit) || vrUnit < 0) return { error: `Valor inválido en "${nombre}"` };
      const ivaRaw = (it as { iva_pct?: unknown }).iva_pct;
      const iva_pct = ivaRaw === undefined ? undefined : Number(ivaRaw) === 0 ? 0 : 0.19;
      items.push({
        item: nombre,
        maquina: String(it.maquina ?? "").trim(),
        unidad: String(it.unidad ?? "VJ").trim() || "VJ",
        cantidad,
        vr_unit: vrUnit,
        valor_base: Math.round(cantidad * vrUnit * 100) / 100,
        ...(iva_pct === undefined ? {} : { iva_pct }),
      });
    }
    return { items, valorBase: items.reduce((s, it) => s + Number(it.valor_base), 0) };
  }
  const catalogo = new Map(catalogoDe(contrato).map((c) => [c.item, c]));
  const items: Array<Record<string, unknown>> = [];
  for (const it of rawItems) {
    const nombre = String(it.item ?? "").trim();
    const cat = catalogo.get(nombre);
    if (!cat) return { error: `"${nombre}" no está en el catálogo Herpro del contrato: usa el nombre exacto para que cruce en la facturación` };
    const cantidad = Number(it.cantidad);
    const vrUnit = Number(it.vr_unit);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: `Cantidad inválida en "${nombre}"` };
    if (!Number.isFinite(vrUnit) || vrUnit <= 0) return { error: `Tarifa inválida en "${nombre}"` };
    items.push({ item: cat.item, maquina: cat.maquina, unidad: cat.unidad, cantidad, vr_unit: vrUnit, valor_base: Math.round(cantidad * vrUnit * 100) / 100 });
  }
  return { items, valorBase: items.reduce((s, it) => s + Number(it.valor_base), 0) };
}

export interface TransicionPrefacturaInput {
  actualEstado: string;
  actualActa: unknown;
  actualMigo: unknown;
  actualFactura: unknown;
  actualFechaFactura: unknown;
  patch: Record<string, unknown>;
}

/** Aplica las transiciones automáticas sin cambiar las reglas de la API. */
export function aplicarTransicionPrefactura(input: TransicionPrefacturaInput): {
  estadoFinal: string;
  patch: Record<string, unknown>;
} {
  const patch = { ...input.patch };
  const actaFinal = "acta" in patch ? patch.acta : input.actualActa;
  const migoFinal = "migo" in patch ? patch.migo : input.actualMigo;
  const facturaFinal = "factura" in patch ? patch.factura : input.actualFactura;
  let estadoFinal = String(patch.estado ?? input.actualEstado);

  if (actaFinal && migoFinal && estadoFinal === "pendiente_acta_migo") estadoFinal = "por_facturar";
  if (facturaFinal && estadoFinal === "por_facturar") {
    estadoFinal = "pendiente_pago";
    if (!("fecha_factura" in patch) && !input.actualFechaFactura) {
      patch.fecha_factura = new Date().toISOString().slice(0, 10);
    }
  }
  if ("factura" in patch && !patch.factura && input.actualFactura && estadoFinal === "pendiente_pago") {
    estadoFinal = actaFinal && migoFinal ? "por_facturar" : "pendiente_acta_migo";
    patch.fecha_factura = null;
    patch.numero_factura = null;
  }
  if (estadoFinal !== input.actualEstado || "estado" in patch) patch.estado = estadoFinal;
  return { estadoFinal, patch };
}
