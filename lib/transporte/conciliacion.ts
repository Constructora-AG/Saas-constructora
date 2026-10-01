// ════════════════════════════════════════════════════════════════════
// Otro Sí / Emergencia — lectura de la «Conciliación de volquetas» (Excel con
// una hoja por corte: FECHA, VOLQUETA, MOVIMIENTO, ACTA, HORAS, GRUPO y, en
// los cortes recientes, horas B2B / B2G) y conversión a registros del módulo.
// Lógica pura (sin React): la usan el botón de Registros y el script de carga.
// ════════════════════════════════════════════════════════════════════

import * as XLSX from "xlsx";
import { nuevoServicioId, num, type Servicio, type Tarifario } from "./model";
import { TARIFARIO_EMERGENCIA_DEFAULT, TARIFAS_GP_EMERGENCIA } from "./constants";

const FIN_TABLA = new Set(["GP1", "GP1P", "GP2", "GP3", "GP4", "GP1S", "TOTAL", "SUBSANAR"]);

export interface FilaConciliacion {
  key: string;
  corte: string;
  fecha: string;
  placa: string;
  viajes: number;
  acta: string;
  horas: number;
  grupo: string;
  zona: "B2B" | "B2G" | "";
}

/** Lee el Excel: por cada fecha se toman las filas de la ÚLTIMA hoja que la contiene (borradores repetidos). */
export function leerConciliacion(datos: ArrayBuffer): FilaConciliacion[] {
  const wb = XLSX.read(datos, { cellDates: true });
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const porHoja: Array<{ hoja: string; filas: Omit<FilaConciliacion, "key">[] }> = [];
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true });
    const h = filas.findIndex((r) => String(r[0] ?? "").trim().toUpperCase() === "FECHA" && String(r[1] ?? "").trim().toUpperCase() === "VOLQUETA");
    if (h < 0) continue;
    const corte = String(filas.slice(0, h).flat().find((c) => /^CORTE/i.test(String(c ?? "").trim())) ?? hoja).trim();
    const enc = filas[h].map((c) => String(c ?? "").trim().toUpperCase());
    const cB2B = enc.indexOf("B2B"), cB2G = enc.indexOf("B2G");
    let fecha = "";
    const out: Omit<FilaConciliacion, "key">[] = [];
    for (const r of filas.slice(h + 1)) {
      if (FIN_TABLA.has(String(r[0] ?? "").trim().toUpperCase())) break;
      if (r[0] instanceof Date) fecha = iso(r[0]);
      const placa = String(r[1] ?? "").trim().toUpperCase();
      const horas = typeof r[4] === "number" ? r[4] : NaN;
      const grupo = String(r[5] ?? "").trim().toUpperCase();
      if (!fecha || !placa || !(horas > 0) || !grupo) continue;
      const base = { corte, fecha, placa, viajes: typeof r[2] === "number" ? r[2] : 0, acta: String(r[3] ?? "").trim(), grupo };
      const hB2B = cB2B >= 0 ? num(r[cB2B] as number) : 0, hB2G = cB2G >= 0 ? num(r[cB2G] as number) : 0;
      if (hB2B > 0) out.push({ ...base, horas: hB2B, zona: "B2B" });
      if (hB2G > 0) out.push({ ...base, horas: hB2G, zona: "B2G" });
      if (!(hB2B > 0) && !(hB2G > 0)) out.push({ ...base, horas, zona: "" });
    }
    if (out.length) porHoja.push({ hoja, filas: out });
  }
  // Fecha → última hoja que la trae (un corte reemitido o un borrador no se duplica).
  const duenoFecha = new Map<string, string>();
  porHoja.forEach(({ hoja, filas }) => filas.forEach((f) => duenoFecha.set(f.fecha, hoja)));
  const elegidas = porHoja.flatMap(({ hoja, filas }) => filas.filter((f) => duenoFecha.get(f.fecha) === hoja));
  // Clave estable para no duplicar al volver a importar: fecha|placa|grupo|zona|n° de ocurrencia.
  const vistas = new Map<string, number>();
  return elegidas.map((f) => {
    const k = `${f.fecha}|${f.placa}|${f.grupo}|${f.zona}`;
    const n = (vistas.get(k) ?? 0) + 1;
    vistas.set(k, n);
    return { ...f, key: `${k}|${n}` };
  });
}

export function registroConciliacion(f: FilaConciliacion, orderNo: string, tarifario: Tarifario): Servicio | null {
  const sencilla = !!TARIFAS_GP_EMERGENCIA[f.grupo]?.sencilla;
  const catId = sencilla ? "vqs" : "vqdt";
  const ruta = [...tarifario.categorias, ...TARIFARIO_EMERGENCIA_DEFAULT.categorias]
    .find((c) => c.id === catId)?.rutas.find((r) => r.id === f.grupo);
  if (!ruta) return null;
  const unit = num(ruta.unitario);
  const base = Math.round(unit * f.horas);
  return {
    id: nuevoServicioId(),
    date: f.fecha,
    orderNo,
    serviceType: "",
    interventor: "",
    areaAAA: f.zona,
    plate: f.placa,
    capacity: "",
    driver: "",
    operario: "",
    equipment: sencilla ? "Volqueta sencilla" : "Volqueta doble troque",
    weight: "",
    pickup: "",
    destination: "",
    area: TARIFAS_GP_EMERGENCIA[f.grupo]?.zona ?? "",
    hourReq: "",
    hourAtt: "",
    value: String(base),
    tolls: "0",
    photo: false,
    approved: false,
    invoiced: false,
    horasMaquina: String(f.horas),
    valorHora: String(unit),
    ivaAlquiler: true,
    ivaTransporte: false,
    valorIva: String(Math.round(base * 0.19)),
    transporteEquipo: false,
    viajesEquipo: "0",
    conciliacion: f.key,
    prefactura: null,
    notes: [`Conciliación ${f.corte}`, f.viajes ? `${f.viajes} viaje(s)` : "", f.acta].filter(Boolean).join(" · "),
    photoFiles: [],
    approvalFile: null,
    tarifaCategoria: catId,
    tarifaRuta: f.grupo,
  };
}

