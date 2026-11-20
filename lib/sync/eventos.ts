/** Extrae el monto de textos de eventos de pago de Smarthome. */
export function parseMontoEvento(txt: string): number | null {
  const m = txt.match(/\$\s*([\d.,]+)/);
  if (!m) return null;
  const sinMiles = m[1].replace(/,/g, "");
  const num = sinMiles.match(/^\d+(?:\.\d+)?/);
  if (!num) return null;
  const n = Number(num[0]);
  return Number.isFinite(n) ? n : null;
}

/** Extrae el número de recibo de caja para identificar pagos distintos. */
export function parseReciboEvento(txt: string): string | null {
  const m = txt.match(/recibo de caja(?:\s+parcial)?\s+no\.?\s*(\d+)/i);
  return m ? m[1] : null;
}
