// ════════════════════════════════════════════════════════════════════
// Marketing — exportación de reportes por pestaña (Excel y PDF).
// Cada vista arma un `Reporte` (KPIs + tablas ya calculadas, con los
// mismos filtros que se ven en pantalla) y este módulo lo convierte en:
//   · XLSX: hoja «Resumen» (contexto + KPIs) y una hoja por tabla, con
//     cabecera fija, autofiltro, números reales (gestionables) y anchos.
//   · PDF: A4 apaisado, membrete AG (logo arriba a la derecha), KPIs en
//     fila y cada tabla con cabecera repetida en cada página.
// Solo navegador (import() dinámico de exceljs / pdf-lib).
// ════════════════════════════════════════════════════════════════════
import { EMPRESA, LOGO_AG_PNG_B64 } from "@/lib/aaa/empresa";
import { b64ToBytes, downloadBlob } from "@/lib/transporte/export";

export type Celda = string | number | null | undefined;
export interface Columna {
  titulo: string;
  /** "n" número entero · "cop" moneda · "pct" porcentaje (0-1) · "t" texto (por defecto). */
  tipo?: "n" | "cop" | "pct" | "t";
  ancho?: number; // ancho relativo en el PDF (por defecto 1); en Excel se calcula
}
export interface Tabla {
  titulo: string;
  nota?: string;
  columnas: Columna[];
  filas: Celda[][];
  /** Fila final en negrita (totales). */
  total?: Celda[];
}
export interface Reporte {
  titulo: string;      // p. ej. "Marketing y leads"
  contexto: string[];  // líneas: período, proyecto, canal, generado…
  kpis: [string, string][];
  tablas: Tabla[];
}

const NUM = new Intl.NumberFormat("es-CO");
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
export const fmtCelda = (v: Celda, tipo: Columna["tipo"] = "t"): string => {
  if (v == null || v === "") return tipo === "t" ? "" : "—";
  if (typeof v === "number") {
    if (tipo === "cop") return COP.format(v);
    if (tipo === "pct") return `${Math.round(v * 100)}%`;
    return NUM.format(v);
  }
  return String(v);
};
const ahoraTexto = () => new Date().toLocaleString("es-CO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// ── Excel ───────────────────────────────────────────────────────────
export async function exportarExcel(rep: Reporte, nombreBase: string): Promise<void> {
  const ExcelJSMod = await import("exceljs");
  const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA.nombre;
  const HEAD_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1F3A5F" } };
  const TOTAL_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE6EDF8" } };

  // Hoja Resumen
  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 38 }, { width: 28 }];
  res.addRow([EMPRESA.nombre]).font = { bold: true, size: 14 };
  res.addRow([`Reporte: ${rep.titulo}`]).font = { bold: true, size: 12 };
  for (const c of rep.contexto) res.addRow([c]).font = { color: { argb: "FF555555" } };
  res.addRow([`Generado: ${ahoraTexto()}`]).font = { color: { argb: "FF555555" } };
  res.addRow([]);
  if (rep.kpis.length) {
    const h = res.addRow(["Indicador", "Valor"]); h.font = { bold: true, color: { argb: "FFFFFFFF" } }; h.eachCell((c) => { c.fill = HEAD_FILL; });
    for (const [k, v] of rep.kpis) res.addRow([k, v]);
    res.addRow([]);
  }
  res.addRow(["Hojas incluidas"]).font = { bold: true };
  const usados = new Set<string>();
  const nombreHoja = (t: string) => {
    let n = t.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Tabla";
    let i = 2; const base = n;
    while (usados.has(n.toLowerCase())) n = `${base.slice(0, 25)} ${i++}`;
    usados.add(n.toLowerCase()); return n;
  };
  for (const t of rep.tablas) {
    const nombre = nombreHoja(t.titulo);
    res.addRow([`• ${nombre}`, `${t.filas.length} filas`]);
    const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = t.columnas.map((c) => ({
      header: c.titulo, key: c.titulo,
      width: Math.min(60, Math.max(c.titulo.length + 2, ...t.filas.map((f, i) => String(fmtCelda(f[t.columnas.indexOf(c)], c.tipo)).length + 2).slice(0, 200), 10)),
      style: c.tipo === "cop" ? { numFmt: '"$"#,##0' } : c.tipo === "pct" ? { numFmt: "0%" } : c.tipo === "n" ? { numFmt: "#,##0.##" } : {},
    }));
    const head = ws.getRow(1); head.font = { bold: true, color: { argb: "FFFFFFFF" } }; head.height = 20;
    head.eachCell((c) => { c.fill = HEAD_FILL; c.alignment = { vertical: "middle", wrapText: true }; });
    for (const f of t.filas) ws.addRow(f.map((v) => (v == null ? "" : v)));
    if (t.total) { const r = ws.addRow(t.total.map((v) => (v == null ? "" : v))); r.font = { bold: true }; r.eachCell((c) => { c.fill = TOTAL_FILL; }); }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, t.filas.length + 1), column: t.columnas.length } };
    if (t.nota) { ws.addRow([]); ws.addRow([t.nota]).font = { italic: true, color: { argb: "FF777777" } }; }
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nombreBase}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

// ── PDF ─────────────────────────────────────────────────────────────
function sane(s: unknown): string {
  return String(s ?? "").replace(/[→⇒➔]/g, "->").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[•·]/g, "-").replace(/[^ -ÿ]/g, "?");
}
export async function exportarPdf(rep: Reporte, nombreBase: string): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PW = 841.89, PH = 595.28, M = 30, W = PW - M * 2;
  const ink = rgb(0.1, 0.1, 0.1), gris = rgb(0.45, 0.45, 0.45), brand = rgb(0.12, 0.23, 0.37);
  const zebra = rgb(0.965, 0.97, 0.98), soft = rgb(0.9, 0.93, 0.97), blanco = rgb(1, 1, 1);
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try { logo = await doc.embedPng(b64ToBytes(LOGO_AG_PNG_B64)); } catch { logo = null; }
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([PW, PH]); pages.push(page);
  let y = PH - M;
  const fit = (s: string, f: typeof font, size: number, maxW: number) => {
    let t = sane(s); if (f.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
    return t + "...";
  };
  const text = (s: string, x: number, yy: number, size: number, f = font, color = ink) => page.drawText(sane(s), { x, y: yy, size, font: f, color });
  const textR = (s: string, xRight: number, yy: number, size: number, f = font, color = ink) => { const t = sane(s); page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color }); };

  const encabezado = () => {
    y = PH - M;
    if (logo) { const lh = 34; const lw = (logo.width / logo.height) * lh; page.drawImage(logo, { x: M + W - lw, y: y - lh, width: lw, height: lh }); }
    text(EMPRESA.nombre, M, y - 12, 10, bold, brand);
    text(`Reporte: ${rep.titulo}`, M, y - 26, 13, bold);
    let yy = y - 40;
    for (const c of rep.contexto) { text(c, M, yy, 8, font, gris); yy -= 10; }
    text(`Generado: ${ahoraTexto()}`, M, yy, 8, font, gris); yy -= 6;
    page.drawLine({ start: { x: M, y: yy - 2 }, end: { x: M + W, y: yy - 2 }, thickness: 0.8, color: brand });
    y = yy - 14;
  };
  const nuevaPagina = () => { page = doc.addPage([PW, PH]); pages.push(page); encabezado(); };
  const asegurar = (h: number) => { if (y - h < M + 14) nuevaPagina(); };
  encabezado();

  // KPIs en fila (tarjetas)
  if (rep.kpis.length) {
    const porFila = Math.min(6, rep.kpis.length);
    const cw = (W - (porFila - 1) * 8) / porFila, ch = 40;
    rep.kpis.forEach((k, i) => {
      const col = i % porFila, row = Math.floor(i / porFila);
      if (col === 0) { asegurar(ch + 8); if (row > 0) y -= ch + 8; }
      const x = M + col * (cw + 8);
      page.drawRectangle({ x, y: y - ch, width: cw, height: ch, color: soft, borderColor: soft });
      text(fit(k[0], font, 7.5, cw - 12), x + 6, y - 13, 7.5, font, gris);
      text(fit(k[1], bold, 12, cw - 12), x + 6, y - 30, 12, bold, brand);
    });
    y -= ch + 16;
  }

  for (const t of rep.tablas) {
    const pesos = t.columnas.map((c) => c.ancho ?? 1); const sum = pesos.reduce((a, b) => a + b, 0);
    const ws = pesos.map((p) => (p / sum) * W);
    const size = 7.5, rowH = 14;
    const cabecera = () => {
      page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: brand });
      let x = M;
      t.columnas.forEach((c, i) => {
        const right = c.tipo && c.tipo !== "t";
        if (right) textR(fit(c.titulo, bold, size, ws[i] - 8), x + ws[i] - 4, y - 10, size, bold, blanco);
        else text(fit(c.titulo, bold, size, ws[i] - 8), x + 4, y - 10, size, bold, blanco);
        x += ws[i];
      });
      y -= rowH;
    };
    asegurar(rowH * 4 + 30);
    text(t.titulo, M, y - 10, 10.5, bold); y -= 16;
    if (t.nota) { text(fit(t.nota, font, 7.5, W), M, y - 8, 7.5, font, gris); y -= 12; }
    cabecera();
    const filas = t.total ? [...t.filas, t.total] : t.filas;
    if (!filas.length) { text("Sin datos para el filtro actual.", M + 4, y - 10, size, font, gris); y -= rowH; }
    filas.forEach((f, r) => {
      if (y - rowH < M + 14) { nuevaPagina(); cabecera(); }
      const esTotal = !!t.total && r === filas.length - 1;
      if (esTotal) page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: soft });
      else if (r % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: zebra });
      let x = M;
      t.columnas.forEach((c, i) => {
        const s = fmtCelda(f[i], c.tipo); const fnt = esTotal ? bold : font;
        if (c.tipo && c.tipo !== "t") textR(fit(s, fnt, size, ws[i] - 8), x + ws[i] - 4, y - 10, size, fnt);
        else text(fit(s, fnt, size, ws[i] - 8), x + 4, y - 10, size, fnt);
        x += ws[i];
      });
      y -= rowH;
    });
    y -= 18;
  }
  pages.forEach((p, i) => { const s = `Página ${i + 1} de ${pages.length}`; p.drawText(sane(s), { x: M + W - font.widthOfTextAtSize(s, 7), y: M - 6, size: 7, font, color: gris }); });
  const bytes = await doc.save();
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${nombreBase}.pdf`, "application/pdf");
}

export const nombreArchivo = (titulo: string) => `${slug(titulo)}-${new Date().toISOString().slice(0, 10)}`;
