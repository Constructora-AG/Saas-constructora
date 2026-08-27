// Tipos y merge del reporte de vendedores (usado por server y client).

export interface VendProspecto {
  asesor: string;
  rol: string;
  total: number;
  prospecto: number;
  seguimiento: number;
  negociacion: number;
  compra: number;
  valor_pipeline: number;
  valor_ventas: number;
}
export interface VendContacto {
  asesor: string;
  rol: string;
  contactos: number;
  whatsapp: number;
}
export interface Vendedor extends VendProspecto {
  contactos: number;
  whatsapp: number;
}

export const ROLES: { key: string; label: string }[] = [
  { key: "ventas", label: "Ventas" },
  { key: "cartera", label: "Cartera" },
  { key: "administracion", label: "Administración" },
  { key: "tramite", label: "Trámite" },
  { key: "facturacion", label: "Facturación" },
  { key: "marketing", label: "Marketing" },
];
export const rolLabel = (k: string) => ROLES.find((r) => r.key === k)?.label ?? k;

export function mergeVendedores(prospectos: VendProspecto[], contactos: VendContacto[]): Vendedor[] {
  const map = new Map<string, Vendedor>();
  for (const p of prospectos ?? []) {
    map.set(p.asesor, {
      asesor: p.asesor,
      rol: p.rol || "ventas",
      total: Number(p.total) || 0,
      prospecto: Number(p.prospecto) || 0,
      seguimiento: Number(p.seguimiento) || 0,
      negociacion: Number(p.negociacion) || 0,
      compra: Number(p.compra) || 0,
      valor_pipeline: Number(p.valor_pipeline) || 0,
      valor_ventas: Number(p.valor_ventas) || 0,
      contactos: 0,
      whatsapp: 0,
    });
  }
  for (const c of contactos ?? []) {
    const cur = map.get(c.asesor) ?? {
      asesor: c.asesor, rol: c.rol || "ventas", total: 0, prospecto: 0, seguimiento: 0,
      negociacion: 0, compra: 0, valor_pipeline: 0, valor_ventas: 0, contactos: 0, whatsapp: 0,
    };
    cur.contactos = Number(c.contactos) || 0;
    cur.whatsapp = Number(c.whatsapp) || 0;
    map.set(c.asesor, cur);
  }
  return [...map.values()].sort((a, b) => b.valor_ventas - a.valor_ventas || b.total - a.total);
}
