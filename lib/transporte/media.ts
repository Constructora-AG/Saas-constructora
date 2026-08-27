// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Adjuntos y compresión de imágenes
// compressImage: máx. 900 px de ancho, JPEG calidad 0.62, salida dataUrl.
// Solo navegador (usa FileReader/canvas); no importar en server components.
// ════════════════════════════════════════════════════════════════════

import { FILE_MAX_BYTES, PDF_WARN_BYTES } from "./constants";
import type { AdjuntoFile } from "./model";

export const IMG_MAX_W = 900;
export const IMG_QUALITY = 0.62;

/** ¿Se trata como imagen? (por mime o, sin mime, por extensión). */
export function isImageFile(f: File): boolean {
  if (f.type) return f.type.startsWith("image/");
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
}

/** ¿Es un PDF? (por mime o extensión). */
export function isPdfFile(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

/** Lee el archivo como data URL, con el tipo original o octet-stream. */
export function readFileAsDataURL(f: File): Promise<AdjuntoFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error(`No se pudo leer el archivo ${f.name}`));
    r.onload = () => resolve({ name: f.name, type: f.type || "application/octet-stream", dataUrl: String(r.result) });
    r.readAsDataURL(f);
  });
}

/**
 * Comprime una imagen a máx. 900 px de ancho (alto proporcional redondeado),
 * JPEG calidad 0.62, como el panel original. Si el navegador no decodifica la
 * imagen (p. ej. HEIC), devuelve el archivo original sin comprimir.
 */
export async function compressImage(f: File): Promise<AdjuntoFile> {
  const original = await readFileAsDataURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode"));
      i.src = original.dataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return original;
    if (w > IMG_MAX_W) {
      h = Math.round((h * IMG_MAX_W) / w);
      w = IMG_MAX_W;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);
    return { name: f.name, type: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", IMG_QUALITY) };
  } catch {
    return original; // formato no decodificable: se adjunta tal cual
  }
}

/**
 * Valida y procesa un archivo seleccionado para adjuntar.
 * - > 20 MB → error (se rechaza).
 * - imagen → comprimida; PDF > 3 MB → warning de recomendación (se adjunta igual).
 */
export async function processSelectedFile(f: File): Promise<{ file: AdjuntoFile; warning: string | null }> {
  if (f.size > FILE_MAX_BYTES) {
    throw new Error(`"${f.name}" pesa más de 20 MB y no se puede adjuntar. Reduce el archivo e inténtalo de nuevo.`);
  }
  let warning: string | null = null;
  if (isPdfFile(f) && f.size > PDF_WARN_BYTES) {
    warning = `"${f.name}" es un PDF de ${(f.size / 1048576).toFixed(1)} MB. Se recomienda adjuntar PDFs de menos de 3 MB para no agotar el peso del mes.`;
  }
  const file = isImageFile(f) ? await compressImage(f) : await readFileAsDataURL(f);
  return { file, warning };
}

// ── Utilidades de tamaño ───────────────────────────────────────────

/** Bytes aproximados que ocupa un data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/** Formato humano de bytes: '1.4 MB' / '820 KB'. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Abre un adjunto en pestaña nueva vía Blob URL (se revoca a los 60 s). */
export function openAttachment(file: AdjuntoFile): void {
  const i = file.dataUrl.indexOf(",");
  const bin = atob(file.dataUrl.slice(i + 1));
  const bytes = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type || "application/octet-stream" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
