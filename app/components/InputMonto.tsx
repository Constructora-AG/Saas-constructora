"use client";
// ════════════════════════════════════════════════════════════════════
// Campo para valores monetarios con formato dentro del propio campo:
// mientras se escribe muestra «$ 185.000» (miles con punto, decimales con
// coma), sin textos de ayuda debajo que muevan el diseño.
//
// El formulario sigue recibiendo el número «crudo» de siempre en onChange
// ("185000" o "16263151.66"), así que Number(), parseValor(), num() y
// montoDigitado() lo interpretan igual que antes.
//
// Uso: <InputMonto className="input" value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
// ════════════════════════════════════════════════════════════════════

import { useLayoutEffect, useRef, type FormEvent, type InputHTMLAttributes } from "react";

const MAX_ENTEROS = 15;
const MAX_DECIMALES = 2;
const AGRUPAR = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0, useGrouping: true });

/** Convierte lo digitado a número: admite "185000", "185.000" (miles con punto) o "185000,5". */
export function montoDigitado(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const txt = String(valor ?? "").trim();
  if (!txt) return null;
  const limpio = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(txt) ? txt.replace(/\./g, "").replace(",", ".") : txt.replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Texto digitado o pegado → número crudo ("1234567" o "1234567.5").
 * La coma es el separador decimal; los puntos son de miles, salvo un único
 * punto seguido de 1–2 cifras al final (formato pegado "16263151.66").
 * Una coma final se conserva ("1234.") para poder seguir escribiendo decimales.
 */
export function montoCrudo(texto: string): string {
  const t = texto.replace(/[^\d.,]/g, "");
  let entero: string;
  let decimal: string | null = null;
  const coma = t.indexOf(",");
  if (coma >= 0) {
    entero = t.slice(0, coma).replace(/\D/g, "");
    decimal = t.slice(coma + 1).replace(/\D/g, "").slice(0, MAX_DECIMALES);
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    [entero, decimal] = t.split(".");
  } else {
    entero = t.replace(/\D/g, "");
  }
  entero = entero.replace(/^0+(?=\d)/, "").slice(0, MAX_ENTEROS);
  if (!entero && decimal === null) return "";
  return decimal === null ? entero : `${entero || "0"}.${decimal}`;
}

/** Valor del formulario (número o texto) → número crudo. */
function crudoDe(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  // Valores calculados (p. ej. horas × tarifa) se muestran con máximo 2 decimales.
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? String(Math.round(v * 100) / 100) : "";
  const s = String(v).trim();
  // Ya es un número crudo ("185000", "1500.5"), el caso normal.
  if (/^\d+(\.\d{0,2})?$/.test(s)) return s;
  // Número con más decimales (valor calculado guardado como texto, "1234.5678"),
  // salvo «1.500»: un punto con 3 cifras tras 1–3 cifras es separador de miles.
  if (/^\d+\.\d+$/.test(s) && !/^\d{1,3}\.\d{3}$/.test(s)) return String(Math.round(Number(s) * 100) / 100);
  return montoCrudo(s);
}

/** Número crudo → texto visible: "1234567.5" → "$ 1.234.567,5". */
export function montoVisible(crudo: string): string {
  if (!crudo) return "";
  const [entero, decimal] = crudo.split(".");
  const miles = AGRUPAR.format(Number(entero || "0"));
  return `$ ${miles}${decimal !== undefined ? `,${decimal}` : ""}`;
}

/** Cifras (y coma decimal) antes de una posición del texto visible. */
const cifrasAntes = (texto: string, pos: number) => texto.slice(0, pos).replace(/[^\d,]/g, "").length;

/** Posición en el texto visible justo después de la cifra número `n`. */
function posicionTras(texto: string, n: number): number {
  if (n <= 0) return texto.startsWith("$ ") ? 2 : 0;
  let vistas = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/[\d,]/.test(texto[i])) vistas++;
    if (vistas === n) return i + 1;
  }
  return texto.length;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "defaultValue"> & {
  value: string | number | null | undefined;
  /** Recibe el número crudo ("" si el campo quedó vacío). */
  onChange: (crudo: string) => void;
};

export function InputMonto({ value, onChange, autoComplete = "off", ...resto }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const cursor = useRef<number | null>(null);
  const crudo = crudoDe(value);
  const visible = montoVisible(crudo);

  // Tras reformatear, el cursor vuelve a quedar después de la misma cifra.
  useLayoutEffect(() => {
    const el = ref.current;
    if (cursor.current === null || !el || document.activeElement !== el) return;
    const pos = posicionTras(visible, cursor.current);
    el.setSelectionRange(pos, pos);
    cursor.current = null;
  }, [visible]);

  const alEscribir = (e: FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const texto = el.value;
    const pos = el.selectionStart ?? texto.length;
    let n = cifrasAntes(texto, pos);
    let nuevo = montoCrudo(texto);
    // Borrar un separador de miles («.») borra la cifra anterior, como espera quien edita.
    const tipo = (e.nativeEvent as InputEvent).inputType;
    if (nuevo === crudo && tipo === "deleteContentBackward" && n > 0) {
      const cifras = texto.replace(/[^\d,]/g, "");
      nuevo = montoCrudo(cifras.slice(0, n - 1) + cifras.slice(n));
      n -= 1;
    }
    cursor.current = n;
    onChange(nuevo);
  };

  return (
    <input
      {...resto}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete={autoComplete}
      value={visible}
      onChange={alEscribir}
    />
  );
}
