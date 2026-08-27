// Tipos del proyecto Triple A (contratos con Triple A de B/Q S.A. E.S.P.).
// La fuente de datos es el corte que arma subgerencia desde Herpro:
//   - Consumido:  centro de costos "AAA"            → Control de costos V2
//   - Facturado:  centro de costos "AAA facturación" → Control de costos V2
//   - Indirectos: reporte "Control de costos indirectos" (incluye nómina manual)
//   - Prefactura: archivo manual del coordinador (ejecutado sin orden de facturación)
// Los nombres de ítems de prefactura DEBEN coincidir con los de Herpro para que crucen.

export interface ItemMaquina {
  presu_qty: number;
  presu_rate: number;
  presu_base: number;
  presu_con_iva: number;
  cons_qty: number;
  cons_rate: number;
  cons_base: number;
  cons_con_iva: number;
  fact_qty: number;
  fact_rate: number;
  fact_base: number;
  fact_con_iva: number;
  proj_base: number;
  proj_con_iva: number;
}

export interface Maquina {
  nombre: string;
  paga_iva_consumido: boolean;
  presupuesto_base: number;
  presupuesto_con_iva: number;
  consumido_base: number;
  consumido_con_iva: number;
  facturado_base: number;
  facturado_con_iva: number;
  prefactura_base: number;
  prefactura_con_iva: number;
  proyectado_base: number;
  proyectado_con_iva: number;
  administracion_externa: number;
  impuestos_facturacion: number | null;
  utilidad_estimada: number;
  utilidad_con_prefactura: number;
  items: Record<string, ItemMaquina>;
}

export interface ResumenFinanciero {
  presupuesto_base: number;
  presupuesto_con_iva: number;
  consumido_base: number;
  consumido_con_iva: number;
  facturado_base: number | null;
  facturado_con_iva: number | null;
  prefactura_base: number;
  prefactura_con_iva: number;
  proyectado_base: number;
  proyectado_con_iva: number;
  administracion_externa: number;
  impuestos_facturacion: number | null;
  utilidad_estimada: number | null;
  utilidad_con_prefactura: number;
}

export interface Consolidado extends ResumenFinanciero {
  indirectos_presupuesto: number;
  indirectos_consumido: number;
  indirectos_items: Record<string, { presupuesto: number; consumido: number }>;
  fecha_corte_indirectos: string;
}

export interface ContratoAlquiler extends ResumenFinanciero {
  id: string;
  nombre: string;
  numero: string;
  cliente: string;
  fecha_inicio: string;
  fecha_fin: string;
  valor_oficial_firmado_con_iva: number;
  fecha_corte_facturado: string;
  fecha_corte_prefactura: string;
  machines: Maquina[];
}

export interface ContratoEmergencia extends ResumenFinanciero {
  id: string;
  nombre: string;
  numero: string;
  cliente: string;
  fecha_inicio: string;
  fecha_fin: string;
  pct_tiempo_transcurrido: number;
  dias_transcurridos: number;
  dias_totales: number;
  fecha_corte_prefactura: string;
  items: Record<string, { qty: number; rate: number; unidad: string; cons_base: number; cons_con_iva: number }>;
}

export interface CorteAaa {
  fecha_corte: string;
  iva_pct: number;
  consolidado: Consolidado;
  contrato_alquiler: ContratoAlquiler;
  contrato_emergencia: ContratoEmergencia;
}
