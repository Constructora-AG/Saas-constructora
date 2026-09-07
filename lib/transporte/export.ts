// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Exportaciones (CSV / XLSX / PDF con soportes)
// Réplica fiel del panel original (SPEC §4.10 y §5.9): 26 columnas
// literales, CSV con «;» + BOM + CRLF, XLSX (hoja «Servicios») y PDF
// con membrete (HEADER_PNG_B64, exportado también para la orden de
// servicio de ordenPdf.ts), portada, tabla resumen, detalle y anexos.
// Módulo COMPARTIDO por ResumenView, RegistrosView, ReportesView y
// ordenPdf.ts. Solo navegador (descarga vía Blob); importar desde
// client components. xlsx y pdf-lib se cargan con import() dinámico
// para no engordar el bundle inicial.
// ════════════════════════════════════════════════════════════════════

import type { PDFFont, PDFImage, PDFPage, RGB } from "pdf-lib";
import {
  CONTRACT_VALUE,
  CONTRATANTE,
  CONTRATISTA,
  CONTRATISTA_NIT,
} from "./constants";
import { fmtCOP, respHours } from "./logic";
import type { AdjuntoFile, Servicio } from "./model";
import { aprobadorDe, areaAAADe, num } from "./model";

/** Par mes+servicio con la etiqueta del mes (para la columna «Mes» y el PDF). */
export interface ExportPair {
  monthKey: string;
  monthLabel: string;
  item: Servicio;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

/** Contexto del contrato para la portada del PDF. */
export interface ExportContexto {
  /** Vigencia legible, p. ej. '01 jul 2026 - 31 ago 2027'. */
  vigencia: string;
  /** Valor total ejecutado de TODO el contrato (el saldo del PDF es global). */
  totalGlobalValue: number;
}

export const SIN_REGISTROS_MSG = "No hay servicios para exportar con los filtros seleccionados.";

// ── Fila de exportación (26 columnas literales, SPEC §5.9) ─────────

export function toExportRow(monthLabel: string, item: Servicio): Record<string, string | number> {
  const adjuntos = [
    ...(item.photoFiles || []).map((f) => f.name),
    item.approvalFile ? item.approvalFile.name : null,
  ]
    .filter(Boolean)
    .join(" | ");
  return {
    "Mes": monthLabel,
    "Fecha": item.date || "",
    "N° Orden / Remisión": item.orderNo || "",
    "Tipo de Servicio": item.serviceType || "",
    "Área AAA solicitante": areaAAADe(item),
    "Placa Vehículo": item.plate || "",
    "Capacidad Vehículo (Ton)": item.capacity ? num(item.capacity) : "",
    "Conductor": item.driver || "",
    "Operario": item.operario || "",
    "Equipo Transportado": item.equipment || "",
    "Peso Equipo (Ton)": item.weight ? num(item.weight) : "",
    "Lugar de Recogida": item.pickup || "",
    "Lugar de Destino": item.destination || "",
    "Municipio / Área": item.area || "",
    "Hora Solicitud": item.hourReq || "",
    "Hora Atención": item.hourAtt || "",
    "Tiempo de Respuesta (h)": respHours(item.hourReq, item.hourAtt) ?? "",
    "Interventor": item.interventor || "",
    "Valor Servicio (COP)": item.value ? num(item.value) : 0,
    "Peajes (COP)": item.tolls ? num(item.tolls) : 0,
    "Evidencia Fotográfica": item.photo ? "Sí" : "No",
    "V°B° Interventor": item.approved ? "Sí" : "No",
    "Facturado": item.invoiced ? "Sí" : "No",
    "Aprobado por (AG)": aprobadorDe(item),
    "Fecha de aprobación": item.approvedAt ? new Date(item.approvedAt).toLocaleString("es-CO") : "",
    "Adjuntos (solo nombres — ver PDF para el contenido)": adjuntos,
    "Observaciones": item.notes || "",
  };
}

// ── CSV (separador «;», comillas dobladas, BOM, CRLF) ──────────────

export function rowsToCSV(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(";")];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(";")));
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadBlob(content: Blob | string, filename: string, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta los pares en el formato pedido. Lanza Error con mensaje legible
 * (SIN_REGISTROS_MSG si no hay registros; mensaje propio si el PDF falla).
 * NO pregunta por facturación: ese flujo es del llamador (markInvoiced del
 * hook) y solo aplica donde el SPEC lo indica.
 */
export async function exportServicios(
  pairs: ExportPair[],
  format: ExportFormat,
  filenameBase: string,
  scopeLabel: string,
  ctx: ExportContexto,
): Promise<void> {
  if (!pairs.length) throw new Error(SIN_REGISTROS_MSG);
  if (format === "csv") {
    const rows = pairs.map((p) => toExportRow(p.monthLabel, p.item));
    downloadBlob(rowsToCSV(rows), `${filenameBase}.csv`, "text/csv;charset=utf-8;");
  } else if (format === "xlsx") {
    // Excel con las fotos de soporte INCRUSTADAS en la fila (ExcelJS), como el
    // control manual del equipo: hasta 3 evidencias por servicio en columnas al final.
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const rows = pairs.map((p) => toExportRow(p.monthLabel, p.item));
    const headers = Object.keys(rows[0]);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Control Transporte AAA";
    const ws = wb.addWorksheet("Servicios", { views: [{ state: "frozen", ySplit: 1 }] });
    const MAX_FOTOS = 3;
    const fotoHeaders = Array.from({ length: MAX_FOTOS }, (_, i) => `Evidencia ${i + 1}`);
    ws.columns = [
      ...headers.map((h) => ({ header: h, key: h, width: Math.min(38, Math.max(12, h.length + 4)) })),
      ...fotoHeaders.map((h) => ({ header: h, key: h, width: 20 })),
    ];
    rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123A7A" } };
    head.alignment = { vertical: "middle", wrapText: true };
    head.height = 30;
    pairs.forEach((p, i) => {
      const fotos = (p.item.photoFiles || []).filter((f) => /image\//.test(f.type) && f.dataUrl).slice(0, MAX_FOTOS);
      const excelRow = i + 2; // 1 = encabezado
      const row = ws.getRow(excelRow);
      row.alignment = { vertical: "top", wrapText: true };
      if (!fotos.length) return;
      row.height = 96;
      fotos.forEach((f, j) => {
        const base64 = f.dataUrl.split(",")[1] || "";
        if (!base64) return;
        const id = wb.addImage({ base64, extension: /png/.test(f.type) ? "png" : "jpeg" });
        // Anclaje en la celda (col/row base 0), tamaño fijo en píxeles
        ws.addImage(id, { tl: { col: headers.length + j, row: excelRow - 1 }, ext: { width: 130, height: 122 }, editAs: "oneCell" });
      });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filenameBase}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    try {
      const bytes = await buildReportPdf(pairs, scopeLabel, ctx);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${filenameBase}.pdf`, "application/pdf");
    } catch (e) {
      console.error("PDF export failed", e);
      throw new Error(
        "No se pudo generar el PDF. Intenta de nuevo; si el problema persiste, puede que algún archivo adjunto esté dañado.",
      );
    }
  }
}

// ── PDF «Reporte con soportes» (pdf-lib, SPEC §4.10) ───────────────

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sanitizeText(s: unknown): string {
  return String(s ?? "")
    .replace(/→/g, "-")
    .replace(/←/g, "-")
    .replace(/⇒/g, "=>")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

interface DrawOpts {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color?: RGB;
}

function safeDrawText(page: PDFPage, text: unknown, options: DrawOpts): void {
  const clean = sanitizeText(text);
  try {
    page.drawText(clean, options);
  } catch {
    page.drawText(clean.replace(/[^\x00-\xFF]/g, "?"), options);
  }
}

function truncateToWidth(font: PDFFont, size: number, text: unknown, maxWidth: number): string {
  let t = sanitizeText(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = t.slice(0, mid) + "…";
    if (font.widthOfTextAtSize(c, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return t.slice(0, lo) + (lo < t.length ? "…" : "");
}

function wrapText(font: PDFFont, size: number, text: unknown, maxWidth: number): string[] {
  const t = sanitizeText(text);
  if (!t) return [""];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

interface PdfAdjunto {
  name: string;
  type: string;
  bytes: Uint8Array;
}

function adjuntoBytes(f: AdjuntoFile): PdfAdjunto {
  return { name: f.name, type: f.type, bytes: b64ToBytes(f.dataUrl.split(",")[1] || "") };
}

/** Construye el PDF completo del reporte con soportes y devuelve sus bytes. */
export async function buildReportPdf(
  pairs: ExportPair[],
  scopeLabel: string,
  ctx: ExportContexto,
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const generatedAt = new Date().toLocaleString("es-CO");

  const rows = pairs.map((p) => ({
    item: p.item,
    monthLabel: p.monthLabel,
    photoFiles: (p.item.photoFiles || []).map(adjuntoBytes),
    approvalFile: p.item.approvalFile ? adjuntoBytes(p.item.approvalFile) : null,
  }));
  const scopedValue = rows.reduce((s, r) => s + num(r.item.value), 0);
  const pendientes = rows.filter((r) => !r.item.invoiced).length;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let headerImg: PDFImage | null = null;
  try {
    headerImg = HEADER_PNG_B64 ? await pdfDoc.embedPng(b64ToBytes(HEADER_PNG_B64)) : null;
  } catch {
    headerImg = null;
  }

  const GRAYDARK = rgb(0.227, 0.227, 0.235);
  const GRAYLINE = rgb(0.89, 0.89, 0.87);
  const MUTED = rgb(0.46, 0.46, 0.48);
  const WHITE = rgb(1, 1, 1);
  const INK = rgb(0.15, 0.15, 0.15);
  const PAGE: Record<"landscape" | "portrait", [number, number]> = {
    landscape: [841.89, 595.28],
    portrait: [595.28, 841.89],
  };
  const MARGIN = 30;
  const ownPages: number[] = [];

  function drawHeaderOn(page: PDFPage): number {
    const { width, height } = page.getSize();
    if (headerImg) {
      const dims = headerImg.scale(1);
      const targetW = width - MARGIN * 2;
      const scale = targetW / dims.width;
      const h = dims.height * scale;
      page.drawImage(headerImg, { x: MARGIN, y: height - MARGIN - h, width: targetW, height: h });
      return height - MARGIN - h - 16;
    }
    return height - MARGIN;
  }
  function newPage(orientation: "landscape" | "portrait"): { page: PDFPage; y: number } {
    const page = pdfDoc.addPage(PAGE[orientation]);
    ownPages.push(pdfDoc.getPageCount() - 1);
    return { page, y: drawHeaderOn(page) };
  }

  // ── Portada ──
  {
    const { page, y: y0 } = newPage("landscape");
    let y = y0 - 10;
    const { width } = page.getSize();
    safeDrawText(page, "CUADRO DE CONTROL DE SERVICIOS DE TRANSPORTE", { x: MARGIN, y, size: 16, font: bold, color: GRAYDARK });
    y -= 22;
    safeDrawText(page, "Contrato IS No. 04-2026 - Transporte de Equipos y Maquinaria Propia", { x: MARGIN, y, size: 10.5, font, color: MUTED });
    y -= 26;
    page.drawRectangle({ x: MARGIN, y: y - 2, width: width - MARGIN * 2, height: 1, color: GRAYLINE });
    y -= 20;
    const metaLines: Array<[string, string]> = [
      ["Contratante", CONTRATANTE],
      ["Contratista", CONTRATISTA],
      ["NIT Contratista", CONTRATISTA_NIT],
      ["Vigencia del contrato", ctx.vigencia],
      ["Valor del contrato (IVA excl.)", fmtCOP(CONTRACT_VALUE)],
      ["Alcance de este reporte", scopeLabel],
      ["Generado el", generatedAt],
    ];
    for (const [label, value] of metaLines) {
      safeDrawText(page, label + ":", { x: MARGIN, y, size: 9.5, font: bold, color: GRAYDARK });
      safeDrawText(page, String(value), { x: MARGIN + 165, y, size: 9.5, font, color: rgb(0.13, 0.13, 0.13) });
      y -= 16;
    }
    y -= 10;
    page.drawRectangle({ x: MARGIN, y: y - 68, width: width - MARGIN * 2, height: 68, color: rgb(0.965, 0.965, 0.945) });
    const kpiCells: Array<[string, string]> = [
      ["Valor ejecutado", fmtCOP(scopedValue)],
      ["Saldo disponible", fmtCOP(CONTRACT_VALUE - ctx.totalGlobalValue)],
      ["Servicios en este reporte", String(rows.length)],
      ["Pendientes por facturar", String(pendientes)],
    ];
    const cellW = (width - MARGIN * 2) / kpiCells.length;
    kpiCells.forEach(([label, value], i) => {
      const cx = MARGIN + i * cellW + 12;
      safeDrawText(page, label, { x: cx, y: y - 20, size: 8, font: bold, color: MUTED });
      safeDrawText(page, value, { x: cx, y: y - 40, size: 12.5, font: bold, color: GRAYDARK });
    });
    y -= 90;
    safeDrawText(page, "Índice de contenido", { x: MARGIN, y, size: 11, font: bold, color: GRAYDARK });
    y -= 16;
    for (const tIdx of [
      "1. Tabla resumen de servicios",
      "2. Detalle y soportes por servicio (evidencia fotográfica y documentos adjuntos)",
    ]) {
      safeDrawText(page, tIdx, { x: MARGIN + 8, y, size: 9.5, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
    }
  }

  // ── Tabla resumen ──
  const cols: Array<{ key: string; label: string; w: number }> = [
    { key: "date", label: "Fecha", w: 50 },
    { key: "plate", label: "Placa", w: 47 },
    { key: "capacity", label: "Cap.T", w: 31 },
    { key: "driver", label: "Conductor", w: 74 },
    { key: "operario", label: "Operario", w: 67 },
    { key: "equipment", label: "Equipo", w: 83 },
    { key: "pickup", label: "Lugar de Recogida", w: 101 },
    { key: "destination", label: "Lugar de Destino", w: 101 },
    { key: "value", label: "Valor", w: 61 },
    { key: "photo", label: "Foto", w: 25 },
    { key: "approved", label: "V°B°", w: 25 },
    { key: "invoiced", label: "Fact.", w: 31 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  function drawTableHeader(page: PDFPage, x: number, y: number): number {
    page.drawRectangle({ x, y: y - 16, width: tableW, height: 16, color: GRAYDARK });
    let cx = x;
    for (const c of cols) {
      safeDrawText(page, c.label, { x: cx + 4, y: y - 12, size: 7.5, font: bold, color: WHITE });
      cx += c.w;
    }
    return y - 16;
  }
  {
    let { page, y } = newPage("landscape");
    safeDrawText(page, "1. Tabla resumen de servicios - " + scopeLabel, { x: MARGIN, y, size: 11.5, font: bold, color: GRAYDARK });
    y -= 18;
    let ty = drawTableHeader(page, MARGIN, y);
    const rowH = 14;
    rows.forEach((r, i) => {
      if (ty - rowH < MARGIN + 20) {
        const created = newPage("landscape");
        page = created.page;
        safeDrawText(page, "1. Tabla resumen de servicios (continuación) - " + scopeLabel, { x: MARGIN, y: created.y, size: 10, font: bold, color: GRAYDARK });
        ty = drawTableHeader(page, MARGIN, created.y - 16);
      }
      if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: ty - rowH, width: tableW, height: rowH, color: rgb(0.97, 0.97, 0.955) });
      const it = r.item;
      const vals: Record<string, string> = {
        date: it.date || "—",
        plate: it.plate || "—",
        capacity: it.capacity ? it.capacity + "T" : "—",
        driver: it.driver || "—",
        operario: it.operario || "—",
        equipment: it.equipment || "—",
        pickup: it.pickup || "—",
        destination: it.destination || "—",
        value: fmtCOP(it.value),
        photo: r.photoFiles.length ? "Sí" : "No",
        approved: it.approved ? "Sí" : "No",
        invoiced: it.invoiced ? "Sí" : "No",
      };
      let cx = MARGIN;
      for (const c of cols) {
        const txt = truncateToWidth(font, 7.5, vals[c.key], c.w - 6);
        safeDrawText(page, txt, { x: cx + 4, y: ty - rowH + 4, size: 7.5, font, color: INK });
        cx += c.w;
      }
      ty -= rowH;
    });
  }

  // ── Detalle por servicio ──
  {
    const { page: p0, y: y0 } = newPage("landscape");
    safeDrawText(p0, "2. Detalle y soportes por servicio", { x: MARGIN, y: y0, size: 13, font: bold, color: GRAYDARK });
    safeDrawText(p0, "Cada servicio muestra su ficha completa, evidencia fotográfica y documentos adjuntos.", { x: MARGIN, y: y0 - 16, size: 9, font, color: MUTED });
  }

  for (const r of rows) {
    const it = r.item;
    let { page, y } = newPage("portrait");
    const { width } = page.getSize();
    const usableW = width - MARGIN * 2;
    safeDrawText(page, `Servicio del ${it.date || "—"} - Placa ${it.plate || "—"} - ${r.monthLabel || ""}`, { x: MARGIN, y, size: 12.5, font: bold, color: GRAYDARK });
    y -= 10;
    page.drawRectangle({ x: MARGIN, y: y - 2, width: usableW, height: 1, color: GRAYLINE });
    y -= 18;
    const fieldPairs: Array<[string, string, string, string]> = [
      ["N° Orden / Remisión", it.orderNo || "—", "Tipo de Servicio", it.serviceType || "—"],
      ["Interventor", it.interventor || "—", "Facturado", it.invoiced ? "Sí" : "No"],
      ["Placa Vehículo", it.plate || "—", "Capacidad (Ton)", it.capacity ? it.capacity + " Ton" : "—"],
      ["Conductor", it.driver || "—", "Operario", it.operario || "—"],
      ["Equipo Transportado", it.equipment || "—", "", ""],
      ["Peso Equipo (Ton)", it.weight ? it.weight + " Ton" : "—", "Municipio / Área", it.area || "—"],
      ["Lugar de Recogida", it.pickup || "—", "Lugar de Destino", it.destination || "—"],
      ["Hora Solicitud", it.hourReq || "—", "Hora Atención", it.hourAtt || "—"],
      ["Valor Servicio", fmtCOP(it.value), "Recargos", [it.recargoNocturno ? "Nocturno" : "", it.recargoDominical ? "Dominical / festivo" : ""].filter(Boolean).join(", ") || "Ninguno"],
      [
        "Evidencia Fotográfica",
        r.photoFiles.length ? `Sí (${r.photoFiles.length})` : "No",
        "V°B° Interventor",
        it.approved ? (r.approvalFile ? "Sí (con documento)" : "Sí") : "No",
      ],
    ];
    const colW = usableW / 2;
    for (const [l1, v1, l2, v2] of fieldPairs) {
      safeDrawText(page, l1 + ":", { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
      safeDrawText(page, truncateToWidth(font, 9, v1, colW - 110), { x: MARGIN + 108, y, size: 9, font, color: INK });
      safeDrawText(page, l2 + ":", { x: MARGIN + colW, y, size: 8.5, font: bold, color: MUTED });
      safeDrawText(page, truncateToWidth(font, 9, v2, colW - 110), { x: MARGIN + colW + 108, y, size: 9, font, color: INK });
      y -= 15;
    }
    y -= 4;
    safeDrawText(page, "Observaciones:", { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
    y -= 12;
    for (const line of wrapText(font, 9, it.notes || "Sin observaciones.", usableW - 4).slice(0, 4)) {
      safeDrawText(page, line, { x: MARGIN, y, size: 9, font, color: INK });
      y -= 12;
    }

    const images = r.photoFiles.filter((f) => /image\//.test(f.type));
    if (images.length) {
      y -= 8;
      safeDrawText(page, `Evidencia fotográfica adjunta (${images.length}):`, { x: MARGIN, y, size: 9.5, font: bold, color: GRAYDARK });
      y -= 10;
      const gap = 10;
      const imgW = (usableW - gap) / 2;
      let col = 0;
      let rowTop = y;
      for (const imgFile of images) {
        let embedded: PDFImage;
        try {
          embedded = /png/.test(imgFile.type)
            ? await pdfDoc.embedPng(imgFile.bytes)
            : await pdfDoc.embedJpg(imgFile.bytes);
        } catch {
          continue;
        }
        const dims = embedded.scale(1);
        const drawH = Math.min(220, dims.height * (imgW / dims.width));
        if (rowTop - drawH < MARGIN + 20) {
          const created = newPage("portrait");
          page = created.page;
          safeDrawText(page, `Servicio del ${it.date || "—"} - continuación de evidencias`, { x: MARGIN, y: created.y, size: 10, font: bold, color: GRAYDARK });
          rowTop = created.y - 16;
          col = 0;
        }
        const x = MARGIN + col * (imgW + gap);
        page.drawImage(embedded, { x, y: rowTop - drawH, width: imgW, height: drawH });
        safeDrawText(page, truncateToWidth(font, 7, imgFile.name || "evidencia", imgW), { x, y: rowTop - drawH - 10, size: 7, font, color: MUTED });
        col++;
        if (col > 1) {
          col = 0;
          rowTop -= drawH + 24;
        }
      }
    }

    const pdfAttachments = [...r.photoFiles, r.approvalFile].filter(
      (f): f is PdfAdjunto => !!f && /pdf/.test(f.type),
    );
    for (const att of pdfAttachments) {
      try {
        const sep = pdfDoc.addPage(PAGE.landscape);
        ownPages.push(pdfDoc.getPageCount() - 1);
        const sy = drawHeaderOn(sep);
        safeDrawText(sep, "ANEXO ADJUNTO", { x: MARGIN, y: sy - 20, size: 13, font: bold, color: GRAYDARK });
        safeDrawText(sep, `Documento: ${att.name}`, { x: MARGIN, y: sy - 40, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
        safeDrawText(sep, `Servicio del ${it.date || "—"} - Placa ${it.plate || "—"} - ${it.equipment || ""}`, { x: MARGIN, y: sy - 56, size: 9.5, font, color: MUTED });
        const srcDoc = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
        const copied = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        copied.forEach((p) => pdfDoc.addPage(p));
      } catch (e) {
        console.error("attachment merge failed", att && att.name, e);
      }
    }
  }

  // ── Pie en páginas propias ──
  const total = pdfDoc.getPageCount();
  ownPages.forEach((pageIndex) => {
    const page = pdfDoc.getPage(pageIndex);
    const { width } = page.getSize();
    safeDrawText(page, `Pagina ${pageIndex + 1} de ${total}`, { x: width / 2 - 40, y: 18, size: 8, font, color: MUTED });
    safeDrawText(page, "Constructora Anaya Giraldo S.A.S. - Cuadro de Control de Contrato", { x: MARGIN, y: 18, size: 7.5, font, color: MUTED });
    safeDrawText(page, generatedAt, { x: width - MARGIN - 110, y: 18, size: 7.5, font, color: MUTED });
  });

  return pdfDoc.save();
}

// ── Membrete AG embebido (mismo PNG base64 del panel original) ─────
export const HEADER_PNG_B64 = "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";
