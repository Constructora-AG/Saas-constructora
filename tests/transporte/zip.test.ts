import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { crc32, crearZip, segmentoSeguro } from "@/lib/transporte/zip";

const enc = new TextEncoder();

test("crc32 coincide con el valor de referencia", () => {
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("segmentoSeguro elimina separadores, «..» y caracteres de control", () => {
  assert.equal(segmentoSeguro("../../etc/passwd"), "_.._etc_passwd");
  assert.equal(segmentoSeguro("Jefatura\u0000 de: Operaciones"), "Jefatura de_ Operaciones");
  assert.equal(segmentoSeguro("..", "Sin área AAA"), "Sin área AAA");
  assert.equal(segmentoSeguro("   "), "archivo");
});

test("crearZip genera un ZIP válido con nombres UTF-8 y renombra duplicados", (t) => {
  const zip = crearZip([
    { ruta: "Disposición Final/2026-09-01 ABC123/foto.jpg", bytes: enc.encode("uno") },
    { ruta: "Disposición Final/2026-09-01 ABC123/foto.jpg", bytes: enc.encode("dos") },
    { ruta: "registros.csv", bytes: enc.encode("a;b\r\n") },
  ], new Date(2026, 8, 1, 10, 30, 0));

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const fin = zip.length - 22;
  assert.equal(view.getUint32(fin, true), 0x06054b50);
  assert.equal(view.getUint16(fin + 10, true), 3);

  // Nombres leídos del directorio central (el unzip de macOS no muestra bien UTF-8).
  const nombres: string[] = [];
  let p = view.getUint32(fin + 16, true);
  while (view.getUint32(p, true) === 0x02014b50) {
    assert.equal(view.getUint16(p + 8, true) & 0x0800, 0x0800);
    const largo = view.getUint16(p + 28, true);
    nombres.push(new TextDecoder().decode(zip.subarray(p + 46, p + 46 + largo)));
    p += 46 + largo;
  }
  assert.deepEqual(nombres, [
    "Disposición Final/2026-09-01 ABC123/foto.jpg",
    "Disposición Final/2026-09-01 ABC123/foto (2).jpg",
    "registros.csv",
  ]);

  const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
  try {
    const archivo = join(dir, "soportes.zip");
    writeFileSync(archivo, zip);
    try {
      execFileSync("unzip", ["-tq", archivo], { encoding: "utf8" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") { t.skip("unzip no está disponible en este entorno"); return; }
      throw e;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
