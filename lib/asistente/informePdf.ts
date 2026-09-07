// Informe del asistente → PDF (A4 vertical, membrete AG). Convierte el
// Markdown de la respuesta: títulos, párrafos, viñetas, tablas y código.
import { EMPRESA, LOGO_AG_PNG_B64 } from "@/lib/aaa/empresa";
import { b64ToBytes, downloadBlob } from "@/lib/transporte/export";

const sane = (s: string) => s.replace(/[→⇒➔]/g, "->").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[•]/g, "-").replace(/[^ -ÿ]/g, "?");
const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/_(.+?)_/g, "$1");

export async function descargarInformePdf(titulo: string, markdown: string, contexto: string[]): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const PW = 595.28, PH = 841.89, M = 44, W = PW - M * 2;
  const ink = rgb(0.1, 0.1, 0.1), gris = rgb(0.45, 0.45, 0.45), brand = rgb(0.12, 0.23, 0.37), soft = rgb(0.9, 0.93, 0.97), zebra = rgb(0.965, 0.97, 0.98);
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try { logo = await doc.embedPng(b64ToBytes(LOGO_AG_PNG_B64)); } catch { logo = null; }
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([PW, PH]); pages.push(page); let y = 0;
  const wrap = (s: string, f: typeof font, size: number, maxW: number) => {
    const out: string[] = []; let line = "";
    for (const w of sane(s).split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) <= maxW) line = t; else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line); return out.length ? out : [""];
  };
  const encabezado = () => {
    y = PH - M;
    if (logo) { const lh = 30; const lw = (logo.width / logo.height) * lh; page.drawImage(logo, { x: M + W - lw, y: y - lh, width: lw, height: lh }); }
    page.drawText(sane(EMPRESA.nombre), { x: M, y: y - 11, size: 9.5, font: bold, color: brand });
    page.drawText(sane(`Asistente de gerencia · ${new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`), { x: M, y: y - 24, size: 7.5, font, color: gris });
    page.drawLine({ start: { x: M, y: y - 34 }, end: { x: M + W, y: y - 34 }, thickness: 0.8, color: brand });
    y -= 48;
  };
  const nueva = () => { page = doc.addPage([PW, PH]); pages.push(page); encabezado(); };
  const asegurar = (h: number) => { if (y - h < M) nueva(); };
  const parrafo = (s: string, f = font, size = 9.5, color = ink, indent = 0, lh = 13) => {
    for (const ln of wrap(inline(s), f, size, W - indent)) { asegurar(lh); page.drawText(ln, { x: M + indent, y: y - size, size, font: f, color }); y -= lh; }
  };
  encabezado();
  parrafo(titulo, bold, 15, brand, 0, 20); y -= 2;
  for (const c of contexto) parrafo(c, font, 8, gris, 0, 10.5);
  y -= 10;

  const lineas = markdown.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lineas.length) {
    const ln = lineas[i];
    if (/^```/.test(ln)) { i++; const buf: string[] = []; while (i < lineas.length && !/^```/.test(lineas[i])) buf.push(lineas[i++]); i++;
      for (const c of buf) { asegurar(11); page.drawText(sane(c).slice(0, 110), { x: M + 6, y: y - 8, size: 7.5, font: mono, color: ink }); y -= 11; } y -= 6; continue; }
    if (/^\|/.test(ln)) {
      const filas: string[][] = [];
      while (i < lineas.length && /^\|/.test(lineas[i])) { const celdas = lineas[i].replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim())); if (!celdas.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(celdas); i++; }
      if (!filas.length) continue;
      const nCols = Math.max(...filas.map((f) => f.length));
      const numCol = filas[0].map((_, c) => filas.slice(1).every((f) => !f[c] || /^[\s$%.,\d-]+$/.test(f[c])));
      const pesos = filas[0].map((_, c) => (numCol[c] ? 1 : 1.8)); const sum = pesos.reduce((a, b) => a + b, 0);
      const ws = pesos.map((p) => (p / sum) * W);
      const size = 8;
      filas.forEach((f, r) => {
        const alturas = f.map((c, ci) => wrap(c, r === 0 ? bold : font, size, ws[ci] - 8).length);
        const h = Math.max(1, ...alturas) * 10.5 + 5;
        if (y - h < M) { nueva(); }
        if (r === 0) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: soft });
        else if (r % 2 === 0) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: zebra });
        let x = M;
        for (let ci = 0; ci < nCols; ci++) {
          const f2 = r === 0 ? bold : font; const lns = wrap(f[ci] ?? "", f2, size, ws[ci] - 8);
          lns.forEach((t, li) => {
            const tw = f2.widthOfTextAtSize(t, size);
            const xx = numCol[ci] && r > 0 ? x + ws[ci] - 4 - tw : x + 4;
            page.drawText(t, { x: xx, y: y - 10 - li * 10.5, size, font: f2, color: ink });
          });
          x += ws[ci];
        }
        y -= h;
      });
      y -= 10; continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(ln);
    if (h) { const nivel = h[1].length; y -= nivel === 1 ? 6 : 4; parrafo(h[2], bold, nivel === 1 ? 13.5 : nivel === 2 ? 11.5 : 10, nivel <= 2 ? brand : ink, 0, nivel === 1 ? 18 : 15); y -= 2; i++; continue; }
    const li = /^\s*([-*•]|\d+[.)])\s+(.*)/.exec(ln);
    if (li) { const marca = /\d/.test(li[1]) ? li[1] : "-"; asegurar(13); page.drawText(marca, { x: M + 8, y: y - 9.5, size: 9.5, font, color: ink }); parrafo(li[2], font, 9.5, ink, 22); i++; continue; }
    if (/^\s*$/.test(ln)) { y -= 5; i++; continue; }
    if (/^---+$/.test(ln)) { asegurar(8); page.drawLine({ start: { x: M, y: y - 3 }, end: { x: M + W, y: y - 3 }, thickness: 0.5, color: gris }); y -= 10; i++; continue; }
    // párrafo: unir líneas consecutivas
    let p = ln; while (i + 1 < lineas.length && lineas[i + 1].trim() && !/^(#|\||```|\s*([-*•]|\d+[.)])\s)/.test(lineas[i + 1])) p += " " + lineas[++i];
    parrafo(p); y -= 3; i++;
  }
  pages.forEach((p, k) => { const s = `Página ${k + 1} de ${pages.length}`; p.drawText(sane(s), { x: M + W - font.widthOfTextAtSize(s, 7), y: M - 14, size: 7, font, color: gris }); });
  const bytes = await doc.save();
  const nombre = `informe-${titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase().slice(0, 50)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), nombre, "application/pdf");
}
