// ════════════════════════════════════════════════════════════════════
// Prefactura en PDF — réplica del formato oficial de AG ("Prefactura No 4"):
// membrete AG, datos de la empresa, recuadro PREFACTURA # N con fechas,
// bloque del cliente Triple A, tabla N°/COD./CANT./CONCEPTO/VR. UNIT/IVA/
// VALOR TOTAL, Cant. Items, SUBTOTAL / IVA / TOTAL, "APROBAR O RECHAZAR" y
// OBSERVACIONES. pdf-lib se importa dinámicamente (solo en el navegador).
// ════════════════════════════════════════════════════════════════════
import type { PrefacturaItem, PrefacturaRow } from "@/lib/aaa/catalogo";
import { CORTE } from "@/lib/aaa/compute";
import { CLIENTE_AAA, EMPRESA, LOGO_AG_PNG_B64 } from "@/lib/aaa/empresa";
import { b64ToBytes, downloadBlob } from "@/lib/transporte/export";

const COP0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const COP2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `$ ${Number.isInteger(Math.round(n * 100) / 100) ? COP0.format(n) : COP2.format(n)}`;

/** Texto seguro para la fuente estándar (WinAnsi). */
function sane(s: unknown): string {
  return String(s ?? "")
    .replace(/[→⇒➔]/g, "->").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[^ -ÿ]/g, "?");
}
const fFecha = (iso: string | null | undefined, corto = false) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return "";
  return `${m[3]}/${m[2]}/${corto ? m[1].slice(2) : m[1]}`;
};

export async function buildPrefacturaPdf(r: PrefacturaRow): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PW = 595.28, PH = 841.89, M = 32;
  const W = PW - M * 2;
  const ink = rgb(0.1, 0.1, 0.1), gris = rgb(0.45, 0.45, 0.45), linea = rgb(0.2, 0.2, 0.2);
  const fondo = rgb(0.85, 0.85, 0.85), fondoClaro = rgb(0.93, 0.93, 0.93), blanco = rgb(1, 1, 1);
  const ivaPct = CORTE.iva_pct;
  const items = (r.items ?? []) as PrefacturaItem[];

  let page = doc.addPage([PW, PH]);
  let y = PH - M;
  type F = typeof font;
  const text = (s: unknown, x: number, yy: number, size: number, f: F = font, color = ink) => page.drawText(sane(s), { x, y: yy, size, font: f, color });
  const textR = (s: unknown, xRight: number, yy: number, size: number, f: F = font, color = ink) => { const t = sane(s); page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color }); };
  const textC = (s: unknown, xc: number, yy: number, size: number, f: F = font, color = ink) => { const t = sane(s); page.drawText(t, { x: xc - f.widthOfTextAtSize(t, size) / 2, y: yy, size, font: f, color }); };
  const rect = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: linea, borderWidth: 0.6, color: fill ?? blanco });
  const wrap = (s: unknown, f: F, size: number, maxW: number): string[] => {
    const words = sane(s).split(/\s+/).filter(Boolean); const out: string[] = []; let cur = "";
    for (const w of words) { const c = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(c, size) > maxW && cur) { out.push(cur); cur = w; } else cur = c; }
    if (cur) out.push(cur); return out.length ? out : [""];
  };

  // ── Encabezado: datos de la empresa a la izquierda, logo AG arriba a la derecha ──
  const yTop = y;
  let logoW = 0;
  try {
    const logo = await doc.embedPng(b64ToBytes(LOGO_AG_PNG_B64));
    const lh = 42; logoW = (logo.width / logo.height) * lh;
    page.drawImage(logo, { x: M + W - logoW, y: yTop - lh, width: logoW, height: lh });
  } catch { /* sin logo */ }
  const textoW = W - logoW - 16; // el texto nunca invade la zona del logo
  text(`Pagina 1 de 1`, M, y - 6, 6.5, font, gris);
  text(EMPRESA.nombre, M, y - 20, 10.5, bold);
  text(`NIT : ${EMPRESA.nit}`, M, y - 32, 8);
  const fiscal = wrap(`${EMPRESA.correo}  ${EMPRESA.regimen} - ${EMPRESA.actividad}`, font, 7.5, textoW);
  fiscal.forEach((ln, k) => text(ln, M, y - 44 - k * 9.5, 7.5, font, rgb(0.05, 0.2, 0.6)));
  y = yTop - 52 - fiscal.length * 9.5;

  // ── Bloque cliente (izquierda) + recuadro prefactura (derecha) ──
  const rowH = 24;
  const leftW = W * 0.72, rightX = M + leftW, rightW = W - leftW;
  const col1 = 62, col2 = 118, col3 = 66; // etiqueta | valor | etiqueta2 (valor2 ocupa el resto, ~137pt)
  const filas: Array<[string, string, string, string]> = [
    ["Cliente:", `${CLIENTE_AAA.nombre}`, "", ""],
    ["NIT:", CLIENTE_AAA.nit, "Teléfono", CLIENTE_AAA.telefono],
    ["Dirección", CLIENTE_AAA.direccion, "Vendedor", CLIENTE_AAA.vendedor],
    ["Ciudad", CLIENTE_AAA.ciudad, "Centro Costo", r.centro_costo || r.area_aaa || ""],
    ["Correo", CLIENTE_AAA.correo, "LUGAR DEL SERVICIO", r.lugar || ""],
  ];
  const topY = y;
  filas.forEach((f, i) => {
    const yy = topY - rowH * (i + 1);
    if (i === 0) {
      rect(M, yy, leftW, rowH, fondo);
      text(`${f[0]} ${f[1]}`, M + 4, yy + 9, 8, bold);
    } else {
      rect(M, yy, col1, rowH, fondo); text(f[0], M + 4, yy + 9, 7, bold);
      rect(M + col1, yy, col2, rowH); text(wrap(f[1], font, 7.5, col2 - 6)[0], M + col1 + 4, yy + 9, 7.5);
      rect(M + col1 + col2, yy, col3, rowH, fondo);
      const l2 = wrap(f[2], bold, 7, col3 - 6); l2.forEach((ln, k) => text(ln, M + col1 + col2 + 3, yy + (l2.length > 1 ? 12 - k * 8 : 8), 7, bold));
      const col4 = leftW - col1 - col2 - col3;
      rect(M + col1 + col2 + col3, yy, col4, rowH);
      const partes = String(f[3]).split("\n").flatMap((s) => wrap(s, font, 7, col4 - 6)).slice(0, 2);
      partes.forEach((ln, k) => text(ln, M + col1 + col2 + col3 + 3, yy + (partes.length > 1 ? 13 - k * 9 : 9), 7));
    }
  });
  // Recuadro derecho
  const rTop = topY, rBot = topY - rowH * filas.length;
  rect(rightX, rBot, rightW, rTop - rBot);
  textC("PREFACTURA", rightX + rightW * 0.42, rTop - 14, 9, bold);
  textR(`# ${r.numero}`, rightX + rightW - 6, rTop - 14, 9, bold);
  page.drawLine({ start: { x: rightX, y: rTop - rowH }, end: { x: rightX + rightW, y: rTop - rowH }, thickness: 0.6, color: linea });
  textC("AG", rightX + rightW / 2, rTop - rowH - 12, 9, bold);
  textC("Fecha y Hora de Factura", rightX + rightW / 2, rTop - rowH * 2 + 4, 7, bold);
  page.drawLine({ start: { x: rightX, y: rTop - rowH * 2 }, end: { x: rightX + rightW, y: rTop - rowH * 2 }, thickness: 0.6, color: linea });
  textC(`Generación ${fFecha(r.fecha_generacion, true)}`, rightX + rightW / 2, rTop - rowH * 2 - 13, 7.5, bold);
  page.drawLine({ start: { x: rightX, y: rTop - rowH * 3 }, end: { x: rightX + rightW, y: rTop - rowH * 3 }, thickness: 0.6, color: linea });
  textC("Expedición", rightX + rightW / 2, rTop - rowH * 3 - 13, 7.5, bold);
  page.drawLine({ start: { x: rightX, y: rTop - rowH * 4 }, end: { x: rightX + rightW, y: rTop - rowH * 4 }, thickness: 0.6, color: linea });
  textC(`Vencimiento ${fFecha(r.fecha_vencimiento) || "-"}`, rightX + rightW / 2, rTop - rowH * 4 - 13, 7.5, bold);
  y = rBot - 12;

  // ── Tabla de conceptos ──
  const cols = [
    { k: "n", label: "N°", w: 0.09, align: "c" },
    { k: "cod", label: "COD.", w: 0.10, align: "l" },
    { k: "cant", label: "CANT.", w: 0.09, align: "c" },
    { k: "concepto", label: "CONCEPTO", w: 0.38, align: "l" },
    { k: "vr", label: "VR. UNIT", w: 0.12, align: "r" },
    { k: "iva", label: "IVA", w: 0.10, align: "r" },
    { k: "total", label: "VALOR TOTAL", w: 0.12, align: "r" },
  ] as const;
  const xs: number[] = []; let acc = M; cols.forEach((c) => { xs.push(acc); acc += c.w * W; }); xs.push(M + W);
  const drawHead = () => {
    rect(M, y - 14, W, 14, fondo);
    cols.forEach((c, i) => { const cx = xs[i], cw = xs[i + 1] - cx; if (i) page.drawLine({ start: { x: cx, y: y - 14 }, end: { x: cx, y }, thickness: 0.6, color: linea }); if (c.align === "c") textC(c.label, cx + cw / 2, y - 10, 7, bold); else if (c.align === "r") textR(c.label, cx + cw - 3, y - 10, 7, bold); else text(c.label, cx + 3, y - 10, 7, bold); });
    y -= 14;
  };
  drawHead();
  const fmtCant = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  items.forEach((it, idx) => {
    const lineas = wrap(String(it.item || "").toUpperCase(), font, 7, cols[3].w * W - 6);
    const h = Math.max(24, 8 + lineas.length * 9);
    if (y - h < 150) { // nueva página para continuar
      page = doc.addPage([PW, PH]); y = PH - M; text(`${r.numero} - continuación`, M, y, 8, bold); y -= 12; drawHead();
    }
    rect(M, y - h, W, h);
    cols.forEach((_, i) => { if (i) page.drawLine({ start: { x: xs[i], y: y - h }, end: { x: xs[i], y }, thickness: 0.6, color: linea }); });
    const base = y - h / 2 - 2.5;
    textC(String(idx + 1), xs[0] + (xs[1] - xs[0]) / 2, base, 7);
    textC(fmtCant(Number(it.cantidad)), xs[2] + (xs[3] - xs[2]) / 2, base, 7);
    lineas.forEach((ln, k) => text(ln, xs[3] + 3, y - 10 - k * 9 - (h - 8 - lineas.length * 9) / 2, 7));
    const valor = Number(it.valor_base) || Number(it.cantidad) * Number(it.vr_unit);
    textR(money(Number(it.vr_unit)), xs[5] - 3, base, 7);
    textR(money(valor * ivaPct), xs[6] - 3, base, 7);
    textR(money(valor), xs[7] - 3, base, 7);
    y -= h;
  });
  rect(M, y - 12, W, 12, fondoClaro); text(`Cant. Items: ${items.length}`, M + 3, y - 9, 7, bold); y -= 16;

  // ── Totales ──
  const subtotal = items.reduce((s, it) => s + (Number(it.valor_base) || Number(it.cantidad) * Number(it.vr_unit)), 0);
  const iva = subtotal * ivaPct;
  const tw = 150, tx = M + W - tw, lw = 60;
  [["SUBTOTAL", money(subtotal)], ["IVA", money(iva)], ["TOTAL", money(subtotal + iva)]].forEach(([l, v], i) => {
    const yy = y - 13 * (i + 1);
    rect(tx, yy, lw, 13, i === 2 ? fondoClaro : blanco); textR(l, tx + lw - 3, yy + 4, 7, bold);
    rect(tx + lw, yy, tw - lw, 13); textR(v, tx + tw - 3, yy + 4, 7, i === 2 ? bold : font);
  });
  text("APROBAR O RECHAZAR:", M, y - 30, 7, bold);
  y -= 13 * 3 + 22;

  // ── Observaciones ──
  text("OBSERVACIONES:", M, y, 7, bold);
  const obs = wrap(r.nota || "", font, 7, W - 90);
  obs.forEach((ln, k) => text(ln.toUpperCase(), M + 80, y - k * 9, 7));
  y -= Math.max(1, obs.length) * 9 + 6;
  if (r.servicios?.length) text(`Servicios de Transporte AAA incluidos: ${r.servicios.length}`, M, y - 4, 6.5, font, gris);

  // Marco general
  page.drawRectangle({ x: M - 6, y: Math.min(y, 130) - 14, width: W + 12, height: PH - M - (Math.min(y, 130) - 14) + 6, borderColor: linea, borderWidth: 0.8 });
  return await doc.save();
}

/** Genera y descarga el PDF de la prefactura. */
export async function descargarPrefacturaPdf(r: PrefacturaRow): Promise<void> {
  const bytes = await buildPrefacturaPdf(r);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `Prefactura ${r.numero}.pdf`, "application/pdf");
}
