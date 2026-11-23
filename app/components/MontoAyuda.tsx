// Muestra, junto a un campo de monto, el valor con separador de miles mientras
// se escribe (185000 → $ 185.000) para que un cero de más salte a la vista.
// Uso: <input id="valor" aria-describedby="valor-ayuda" … /> <MontoAyuda id="valor-ayuda" valor={valor} />

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Convierte lo digitado a número: admite "185000", "185.000" (miles con punto) o "185000,5". */
export function montoDigitado(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const txt = String(valor ?? "").trim();
  if (!txt) return null;
  const limpio = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(txt) ? txt.replace(/\./g, "").replace(",", ".") : txt.replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function MontoAyuda({ valor, id, prefijo }: { valor: string | number | null | undefined; id?: string; prefijo?: string }) {
  const n = montoDigitado(valor);
  // Solo ayuda cuando hay un monto: «$ 0» en un campo vacío o en cero sería ruido.
  if (n === null || n === 0) return null;
  return (
    <span id={id} className="monto-ayuda" aria-live="polite">
      {prefijo ? `${prefijo} ` : ""}{COP.format(n)}
    </span>
  );
}
