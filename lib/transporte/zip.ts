// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Empaquetado ZIP de soportes
// Escritor ZIP mínimo sin compresión (método STORE): las evidencias ya
// llegan comprimidas (JPEG 0.62 / PDF), así que deflate casi no ahorra
// peso y evita agregar una dependencia. Funciona en navegador y en Node.
// ════════════════════════════════════════════════════════════════════

export interface ZipEntrada {
  /** Ruta dentro del ZIP, con «/» como separador de carpetas. */
  ruta: string;
  bytes: Uint8Array;
}

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en formato MS-DOS (resolución de 2 s), como exige la cabecera ZIP. */
function fechaDos(d: Date): { hora: number; fecha: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Nombre seguro para un segmento de ruta del ZIP: sin separadores, caracteres
 * de control ni «..», para que al descomprimir no se escriba fuera de la carpeta.
 */
export function segmentoSeguro(texto: string, respaldo = "archivo"): string {
  const limpio = texto
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  return limpio || respaldo;
}

/**
 * Arma un ZIP (sin compresión) con las entradas dadas y devuelve sus bytes.
 * Las rutas repetidas se renombran con sufijo « (2)», « (3)»… antes de la extensión.
 * No admite ZIP64: lanza Error si el paquete supera 4 GB o 65 535 archivos.
 */
export function crearZip(entradas: ZipEntrada[], ahora = new Date()): Uint8Array {
  if (entradas.length > 0xffff) throw new Error("Demasiados archivos para un solo ZIP.");
  const enc = new TextEncoder();
  const { hora, fecha } = fechaDos(ahora);
  const usadas = new Set<string>();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;

  for (const e of entradas) {
    let ruta = e.ruta;
    if (usadas.has(ruta.toLowerCase())) {
      const punto = ruta.lastIndexOf(".");
      const base = punto > ruta.lastIndexOf("/") ? ruta.slice(0, punto) : ruta;
      const ext = base === ruta ? "" : ruta.slice(punto);
      let n = 2;
      while (usadas.has(`${base} (${n})${ext}`.toLowerCase())) n++;
      ruta = `${base} (${n})${ext}`;
    }
    usadas.add(ruta.toLowerCase());
    const nombre = enc.encode(ruta);
    const crc = crc32(e.bytes);
    const tam = e.bytes.length;

    const local = new Uint8Array(30 + nombre.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // bit 11: nombre en UTF-8 (tildes y ñ)
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, hora, true);
    lv.setUint16(12, fecha, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, tam, true);
    lv.setUint32(22, tam, true);
    lv.setUint16(26, nombre.length, true);
    local.set(nombre, 30);

    const central = new Uint8Array(46 + nombre.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, hora, true);
    cv.setUint16(14, fecha, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, tam, true);
    cv.setUint32(24, tam, true);
    cv.setUint16(28, nombre.length, true);
    cv.setUint32(42, offset, true);
    central.set(nombre, 46);

    locales.push(local, e.bytes);
    centrales.push(central);
    offset += local.length + tam;
    if (offset > 0xffffffff) throw new Error("Los soportes superan 4 GB; filtra un periodo o área más pequeña.");
  }

  const tamCentral = centrales.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const fv = new DataView(fin.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, entradas.length, true);
  fv.setUint16(10, entradas.length, true);
  fv.setUint32(12, tamCentral, true);
  fv.setUint32(16, offset, true);

  const out = new Uint8Array(offset + tamCentral + fin.length);
  let p = 0;
  for (const parte of [...locales, ...centrales, fin]) { out.set(parte, p); p += parte.length; }
  return out;
}
