// Normaliza el nombre del asesor/vendedor: en Smarthome vienen con variantes de
// mayúsculas, espacios, dígitos ("SOLIANA 2 MONROY MERCADO") y truncados de apellido.

function base(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/\b\d+\b/g, " ") // dígitos sueltos: "soliana 2" -> "soliana"
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Fusiones explícitas para variantes que el genérico no une (apellidos truncados).
const RULES: [RegExp, string][] = [
  [/^soliana/, "Soliana Monroy Mercado"],
  [/^merly/, "Merly Vega Martinez"],
  [/^claudia m|^claudia ortiz|^claudia milena/, "Claudia Milena Ortiz Rueda"],
  [/^claudia viloria/, "Claudia Viloria"],
  [/^claudia reina/, "Claudia Reina"],
  [/^evelyn/, "Evelyn Meriño"],
];

export function canonicalAsesor(raw: string | null | undefined): string {
  const b = base(raw ?? "");
  if (!b) return "";
  for (const [re, name] of RULES) if (re.test(b)) return name;
  return titleCase(b);
}

// Cuentas de sistema / no-vendedores que deben excluirse del reporte.
const EXCLUDE = new Set(["administrador smarthome", "administrador", "sistema"]);
export function esVendedorReal(raw: string | null | undefined): boolean {
  const b = base(raw ?? "");
  return b.length > 1 && !EXCLUDE.has(b);
}
