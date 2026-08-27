import type { Consolidado, CorteAaa, ResumenFinanciero } from "./types";
import corte from "./corte-2026-07-31.json";

// Reglas de negocio acordadas con subgerencia (reunión 17-jul):
// - Administración externa (interventor): 5% sobre el valor con IVA facturado + prefactura.
// - Ingreso por IVA facturado: Andrés indicó reconocer como ingreso el 42% del IVA recaudado.
// - El IVA recaudado no es ingreso de AG: se remite a la DIAN.
export const ADMIN_PCT = 0.05;
export const INGRESO_IVA_PCT = 0.42;

export const CORTE = corte as CorteAaa;

export interface PanelUtilidad {
  facturadoConIva: number | null;
  prefacturaConIva: number;
  totalConIva: number;
  netoSinIva: number;
  ivaRecaudado: number;
  adminExterna: number;
  consumidoBase: number;
  indirectosConsumido: number | null;
  utilidadConPrefactura: number;
  ingresoIva: number;
  utilidadFinal: number;
  utilidadSoloFacturado: number | null;
  diferenciaPrefactura: number | null;
}

export function panelUtilidad(obj: ResumenFinanciero | Consolidado): PanelUtilidad {
  const facturadoConIva = obj.facturado_con_iva;
  const prefacturaConIva = obj.prefactura_con_iva || 0;
  const totalConIva = (facturadoConIva ?? 0) + prefacturaConIva;
  const netoSinIva = totalConIva / (1 + CORTE.iva_pct);
  const ivaRecaudado = totalConIva - netoSinIva;
  const ingresoIva = ivaRecaudado * INGRESO_IVA_PCT;
  const utilidadConPrefactura = obj.utilidad_con_prefactura;
  const utilidadSoloFacturado = obj.utilidad_estimada;
  return {
    facturadoConIva,
    prefacturaConIva,
    totalConIva,
    netoSinIva,
    ivaRecaudado,
    adminExterna: totalConIva * ADMIN_PCT,
    consumidoBase: obj.consumido_base,
    indirectosConsumido: "indirectos_consumido" in obj ? obj.indirectos_consumido : null,
    utilidadConPrefactura,
    ingresoIva,
    utilidadFinal: utilidadConPrefactura + ingresoIva,
    utilidadSoloFacturado,
    diferenciaPrefactura: utilidadSoloFacturado === null ? null : utilidadConPrefactura - utilidadSoloFacturado,
  };
}
