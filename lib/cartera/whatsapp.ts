// Construcción del enlace wa.me y la plantilla de mensaje de cobro.
// No envía nada: arma el texto y el link para que el cobrador lo abra.

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export interface CobroContext {
  cliente: string;
  modulo: string;
  proyecto: string;
  montoEnMora: number;
  cuotasVencidas: number;
  diasMora: number;
  proximaCuotaFecha?: string | null;
}

// Normaliza a formato internacional Colombia (+57) para wa.me (solo dígitos).
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d; // celular colombiano
  return d; // ya trae indicativo u otro formato
}

export function plantillaCobro(ctx: CobroContext): string {
  const nombre = ctx.cliente.split(/\s+/)[0] || ctx.cliente;
  if (ctx.cuotasVencidas > 0) {
    return (
      `Hola ${nombre}, le saludamos de Constructora Anaya Giraldo. ` +
      `Le recordamos que su inmueble ${ctx.modulo} (${ctx.proyecto}) presenta ` +
      `${ctx.cuotasVencidas} cuota(s) pendiente(s) por ${COP.format(ctx.montoEnMora)}` +
      (ctx.diasMora > 0 ? ` con ${ctx.diasMora} días de mora` : "") +
      `. Por favor ayúdenos a ponernos al día o coordinemos un acuerdo de pago. ¡Gracias!`
    );
  }
  return (
    `Hola ${nombre}, le saludamos de Constructora Anaya Giraldo. ` +
    `Le recordamos su próxima cuota de su inmueble ${ctx.modulo} (${ctx.proyecto})` +
    (ctx.proximaCuotaFecha ? ` con vencimiento ${ctx.proximaCuotaFecha}` : "") +
    `. Quedamos atentos. ¡Gracias!`
  );
}

export function waLink(phone: string | null, mensaje: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(mensaje)}`;
}
