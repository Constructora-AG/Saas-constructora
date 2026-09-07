// Tipos del módulo Marketing y Gestión de Leads (espejo en Supabase).

export interface Lead {
  id: string;
  prospect_id: string | null;
  proyecto: string;
  canal: string;
  medio: string;
  campana: string;
  ad_id: string;
  ad_titulo: string;
  ad_tipo: string;
  ad_url: string;
  ad_miniatura: string;
  formulario: string;
  asesor: string;
  fecha_creacion: string | null;
  primera_accion: string | null;
  horas_primera_accion: number | null;
  ciclo: string;
  etapa: string;
  probabilidad: number;
  es_venta: boolean;
  es_unico: boolean;
  cliente_existente: boolean;
  fecha_cierre: string | null;
  credito_aprobado: string;
  empleo: string;
  reportado: string;
  capacidad_pago: string;
  motivacion: string;
  tiempo_compra: string;
}

export interface Prospecto {
  prospect_id: string;
  nombre: string | null;
  asesor: string;
  proyecto: string | null;
  etapa: string | null;
  ciclo: string | null;
  valor: number;
  fecha_creacion: string | null;
  es_venta: boolean;
  genero: string | null;
  edad: number | null;
  ocupacion: string | null;
  profesion: string | null;
  cargo: string | null;
  barrio: string | null;
  ciudad: string | null;
  estado_civil: string | null;
  fuente: string | null;
  probabilidad: number | null;
  fecha_cierre: string | null;
  seguimiento: number | null; // 0 inactivo | 1 activo | 3 vencido
  estado_credito: string | null;
  digital: boolean | null;
  acciones: number;
  acciones_detalle: Record<string, number> | null;
  reportado: string | null;
}

export interface Inversion {
  id: string;
  mes: string; // YYYY-MM
  proyecto: string;
  canal: string;
  monto: number;
  nota: string | null;
}

/** Venta real (unidad en cartera) cruzada con el prospecto y el lead digital. */
export interface VentaCartera {
  prospect_id: string | null;
  project_name: string;
  module: string;
  total_valor: number | null;
  digital: boolean;      // el prospecto llegó por canal digital (Smarthome)
  lead: boolean;         // existe como lead digital en mk_leads (campañas sincronizadas)
  fecha_creacion: string | null; // del prospecto
  /** Fecha de la venta: cierre del prospecto o, si falta, primer abono. */
  fecha_venta: string | null;
  cliente?: string | null;
}

export interface MarketingData {
  leads: Lead[];
  prospectos: Prospecto[];
  compradores: Prospecto[]; // todos los que compraron (sin filtro de fecha) — perfil del comprador
  /** Ventas reales (tabla cartera): la fuente de verdad de unidades vendidas. */
  ventas: VentaCartera[];
  inversion: Inversion[];
  ultimoSync: string | null;
  syncDetalle: Record<string, unknown> | null;
}

// Semáforo de seguimiento de Smarthome (ActivityStatus / Seguimiento).
export const SEGUIMIENTO = {
  INACTIVO: 0,
  ACTIVO: 1,
  VENCIDO: 3,
} as const;
