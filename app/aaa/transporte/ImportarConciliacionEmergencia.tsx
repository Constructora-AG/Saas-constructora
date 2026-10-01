"use client";
// ════════════════════════════════════════════════════════════════════
// Otro Sí / Emergencia — importar la «Conciliación de volquetas» (Excel con
// una hoja por corte: FECHA, VOLQUETA, MOVIMIENTO, ACTA, HORAS, GRUPO y, en
// los cortes recientes, horas B2B / B2G). Cada volqueta-día es un registro;
// si la fila trae horas en B2B y B2G se parte en dos (una por zona).
// Valor = horas × tarifa sin IVA del grupo (tarifario del módulo) + IVA 19%.
// Los registros creados antes desde facturas AGF se eliminan para no contar
// el mismo trabajo dos veces. Solo toca el espacio de datos de Emergencia.
// ════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { nuevoServicioId, num, type Servicio, type Tarifario } from "@/lib/transporte/model";
import { TARIFARIO_EMERGENCIA_DEFAULT, TARIFAS_GP_EMERGENCIA } from "@/lib/transporte/constants";
import { applyContractDates } from "@/lib/transporte/logic";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import { siguienteOrden } from "./ServicioForm";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const FIN_TABLA = new Set(["GP1", "GP1P", "GP2", "GP3", "GP4", "GP1S", "TOTAL", "SUBSANAR"]);

interface FilaConciliacion {
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
async function leerConciliacion(file: File): Promise<FilaConciliacion[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
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

function registroDe(f: FilaConciliacion, orderNo: string, tarifario: Tarifario): Servicio | null {
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

export function ImportarConciliacionEmergencia({ t }: { t: UseTransporte }) {
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const existentes = useMemo(() => {
    const keys = new Set<string>();
    let agf = 0;
    Object.values(t.servicesByMonth).forEach((arr) => (arr ?? []).forEach((s) => {
      if (s.conciliacion) keys.add(s.conciliacion);
      if (s.facturaAGF) agf += 1;
    }));
    return { keys, agf };
  }, [t.servicesByMonth]);

  async function importar(file: File) {
    setMsg(null);
    try {
      const filas = await leerConciliacion(file);
      if (filas.length === 0) {
        setMsg({ ok: false, texto: "No se encontraron filas de conciliación (se esperan hojas con FECHA, VOLQUETA, MOVIMIENTO, ACTA, HORAS y GRUPO)." });
        return;
      }
      const nuevas = filas.filter((f) => !existentes.keys.has(f.key)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
      const tarifario = t.tarifario ?? TARIFARIO_EMERGENCIA_DEFAULT;
      const sig = siguienteOrden(t.servicesByMonth, "emergencia");
      const prefijo = sig.replace(/\d+$/, "");
      const base = parseInt(sig.replace(/\D/g, ""), 10);
      const sinTarifa = new Set<string>();
      const items: Array<{ monthKey: string; item: Servicio }> = [];
      nuevas.forEach((f) => {
        const item = registroDe(f, `${prefijo}${String(base + items.length).padStart(4, "0")}`, tarifario);
        if (item) items.push({ monthKey: f.fecha.slice(0, 7), item });
        else sinTarifa.add(f.grupo);
      });
      if (items.length === 0 && existentes.agf === 0) {
        setMsg({ ok: false, texto: `No hay registros nuevos: las ${filas.length} fila(s) del archivo ya estaban registradas.` });
        return;
      }
      const horas = items.reduce((s, x) => s + num(x.item.horasMaquina), 0);
      const total = items.reduce((s, x) => s + num(x.item.value) + num(x.item.valorIva), 0);
      const sinZona = items.filter((x) => !x.item.areaAAA).length;
      const lineas = [
        `Se crearán ${items.length} registro(s) de volquetas (${horas.toLocaleString("es-CO")} h · ${COP.format(total)} con IVA) desde ${file.name}.`,
        filas.length - nuevas.length > 0 ? `${filas.length - nuevas.length} fila(s) ya estaban registradas y se omiten.` : "",
        sinZona > 0 ? `${sinZona} registro(s) quedan sin zona B2B/B2G (el corte no la desglosa por fila): complétala al editar.` : "",
        sinTarifa.size > 0 ? `Se omiten filas de grupo(s) sin tarifa: ${[...sinTarifa].join(", ")}.` : "",
        existentes.agf > 0 ? `Se ELIMINARÁN los ${existentes.agf} registro(s) creados desde facturas AGF para no contar el mismo trabajo dos veces.` : "",
        "¿Continuar?",
      ].filter(Boolean);
      if (!window.confirm(lineas.join("\n\n"))) return;
      setTrabajando(true);
      // La vigencia debe cubrir la primera fecha para que su mes exista en Registros.
      let inicio = t.admin?.contractStart || "";
      const primera = nuevas[0]?.fecha;
      if (primera && (!inicio || primera < inicio)) {
        await t.saveAdminCfg((a) => { a.contractStart = primera; });
        inicio = primera;
      }
      const meses = applyContractDates(inicio || "2026-05-21", t.admin?.contractEnd || "").months.map((m) => m.key);
      await t.importServices(items, existentes.agf > 0 ? { meses, si: (s) => !!s.facturaAGF } : undefined);
      setMsg({
        ok: true,
        texto: `Listo: ${items.length} registro(s) de volquetas creados${existentes.agf > 0 ? ` y ${existentes.agf} registro(s) de facturas AGF eliminados` : ""}.${sinZona > 0 ? ` ${sinZona} sin zona B2B/B2G.` : ""}`,
      });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div style={{ marginBottom: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label className="btn btn-ghost btn-sm" style={{ cursor: trabajando ? "default" : "pointer" }}>
          {trabajando ? "Creando registros…" : "Importar conciliación de volquetas (Excel)"}
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            disabled={trabajando}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importar(f); }}
          />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Cada volqueta-día de la conciliación crea un registro (partido por zona B2B / B2G); las filas ya registradas no se duplican.
        </span>
      </div>
      {msg && <div className="info-bar" style={{ marginBottom: 0, color: msg.ok ? "var(--ok)" : "var(--high)" }}>{msg.texto}</div>}
    </div>
  );
}
