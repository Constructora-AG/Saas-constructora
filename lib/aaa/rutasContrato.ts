// Rutas de cada contrato de Proyecto Triple A y de su módulo anidado de
// prefacturas. El "contrato" de una prefactura es el mismo espacio de datos
// (ns) del módulo que la generó: transporte | alquiler | emergencia | <id>.

const BASE_FIJA: Record<string, string> = {
  transporte: "/aaa/transporte",
  alquiler: "/aaa/contrato-alquiler",
  emergencia: "/aaa/otro-si-emergencia",
};

/** Ruta del módulo del contrato. */
export function rutaModuloContrato(contrato: string): string {
  return BASE_FIJA[contrato] ?? `/aaa/contratos/${contrato}`;
}

/** Ruta del módulo de prefacturas propio del contrato. */
export function rutaPrefacturasContrato(contrato: string): string {
  return `${rutaModuloContrato(contrato)}/prefacturas`;
}
