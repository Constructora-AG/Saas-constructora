"use client";
// ════════════════════════════════════════════════════════════════════
// Contrato de Alquiler / Otro Sí – Emergencia: las facturas AGF (tabla aparte
// aaa_facturas o un Excel) pasan a ser registros (servicios) del módulo. Cada
// módulo usa SOLO sus facturas y su espacio de datos; nunca se mezclan.
// Cada factura crea un registro con fecha, equipo y valor; lo demás
// (interventor, área, placa, horas…) queda en blanco para completarlo luego.
// Los ya migrados se reconocen por `facturaAGF` y no se duplican.
// ════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { nuevoServicioId, type Servicio } from "@/lib/transporte/model";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import { parseValor, useRegistrosContrato, type FacturaRow } from "../FacturasRegistro";
import { siguienteOrden } from "./ServicioForm";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type ContratoRegistros = "alquiler" | "emergencia";

function registroDe(f: FacturaRow, orderNo: string): Servicio {
  const equipos = f.concepto.replace(/^Alquiler:\s*/i, "").trim();
  return {
    id: nuevoServicioId(),
    date: f.fecha,
    orderNo,
    serviceType: "", // las facturas no indican el tipo (Programado / No Programado / Emergencia): se completa al editar
    interventor: "",
    areaAAA: "",
    plate: "",
    capacity: "",
    driver: "",
    operario: "",
    equipment: equipos,
    weight: "",
    pickup: "",
    destination: "",
    area: "",
    hourReq: "",
    hourAtt: "",
    value: String(Number(f.valor_total)),
    tolls: "0",
    photo: false,
    approved: false,
    invoiced: true,
    transporteEquipo: /transporte de equipo/i.test(f.concepto),
    facturaAGF: f.numero,
    prefactura: f.numero, // ya facturado: no se vuelve a prefacturar
    notes: [`Factura ${f.numero} (valor total con IVA). Pendiente completar información del registro.`, f.nota ?? ""].filter(Boolean).join(" "),
    photoFiles: [],
    approvalFile: null,
    tarifaCategoria: null,
    tarifaRuta: null,
  };
}

export function ImportarFacturasContrato({ t, contrato }: { t: UseTransporte; contrato: ContratoRegistros }) {
  const facturas = useRegistrosContrato(contrato);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const yaMigradas = useMemo(() => {
    const set = new Set<string>();
    Object.values(t.servicesByMonth).forEach((arr) => (arr ?? []).forEach((s) => s.facturaAGF && set.add(s.facturaAGF.toUpperCase())));
    return set;
  }, [t.servicesByMonth]);

  const pendientes = useMemo(
    () =>
      facturas.rows
        .filter((f) => !yaMigradas.has(f.numero.toUpperCase()))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, "es", { numeric: true })),
    [facturas.rows, yaMigradas],
  );
  const total = pendientes.reduce((s, f) => s + Number(f.valor_total), 0);

  /** Crea un registro por factura (sin duplicar las ya registradas), con N° de orden consecutivo del módulo (AL / EM) en orden cronológico. */
  async function crearRegistros(lista: FacturaRow[], origen: string) {
    const nuevas = lista
      .filter((f) => !yaMigradas.has(f.numero.toUpperCase()))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, "es", { numeric: true }));
    const repetidas = lista.length - nuevas.length;
    if (nuevas.length === 0) {
      setMsg({ ok: false, texto: `No hay registros nuevos: las ${repetidas} factura(s) (${origen}) ya estaban registradas.` });
      return;
    }
    const totalNuevas = nuevas.reduce((s, f) => s + Number(f.valor_total), 0);
    const aviso = repetidas > 0 ? ` (${repetidas} ya estaban registradas y se omiten)` : "";
    if (!window.confirm(`Se crearán ${nuevas.length} registro(s) por ${COP.format(totalNuevas)} desde ${origen}${aviso}, marcados como facturados. La información faltante queda en blanco para completarla después. ¿Continuar?`)) return;
    setTrabajando(true);
    setMsg(null);
    try {
      // La vigencia debe cubrir la fecha de la primera factura para que el mes exista en Registros.
      const primera = nuevas[0].fecha;
      if (!t.admin?.contractStart || primera < t.admin.contractStart) {
        await t.saveAdminCfg((a) => { a.contractStart = `${primera.slice(0, 7)}-01`; });
      }
      const sig = siguienteOrden(t.servicesByMonth, t.ficha.prefijoOrden);
      const prefijo = sig.replace(/\d+$/, "");
      const base = parseInt(sig.replace(/\D/g, ""), 10);
      const items = nuevas.map((f, i) => ({
        monthKey: f.fecha.slice(0, 7),
        item: registroDe(f, `${prefijo}${String(base + i).padStart(4, "0")}`),
      }));
      await t.importServices(items);
      setMsg({ ok: true, texto: `Listo: ${items.length} registro(s) creados desde ${origen}${aviso}. Complétalos con «Editar» en cada mes.` });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajando(false);
    }
  }

  async function importarExcel(file: File) {
    try {
      const lista = await leerFacturasExcel(file, contrato);
      if (lista.length === 0) {
        setMsg({ ok: false, texto: "No se encontraron facturas en el archivo (se esperan columnas «N° Factura», «Fecha», «Concepto» y «Valor Total»)." });
        return;
      }
      await crearRegistros(lista, `el archivo ${file.name}`);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div style={{ marginBottom: 14, display: "grid", gap: 10 }}>
      {!facturas.cargando && pendientes.length > 0 && (
        <div className="info-bar" style={{ marginBottom: 0, alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            Hay <b>{pendientes.length}</b> factura(s) AGF ({COP.format(total)}) cargadas como tabla aparte que aún no son registros del contrato.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void crearRegistros(pendientes, "las facturas AGF")} disabled={trabajando}>
            {trabajando ? "Creando registros…" : "Pasar a Registros"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label className="btn btn-ghost btn-sm" style={{ cursor: trabajando ? "default" : "pointer" }}>
          {trabajando ? "Creando registros…" : "Importar facturas (Excel)"}
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            disabled={trabajando}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarExcel(f); }}
          />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>Cada factura AGF del archivo crea un registro; las ya registradas no se duplican.</span>
      </div>
      {msg && <div className="info-bar" style={{ marginBottom: 0, color: msg.ok ? "var(--ok)" : "var(--high)" }}>{msg.texto}</div>}
    </div>
  );
}

/** Lee un Excel de facturas (N° Factura, Fecha, Concepto, Valor Total) buscando la fila de encabezados. */
async function leerFacturasExcel(file: File, contrato: ContratoRegistros): Promise<FacturaRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const iso = (v: unknown): string => {
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    const s = String(v ?? "").trim();
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  };
  const out: FacturaRow[] = [];
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true });
    const h = filas.findIndex((r) => r.some((c) => norm(c).includes("factura")) && r.some((c) => norm(c).includes("valor")));
    if (h < 0) continue;
    const enc = filas[h].map(norm);
    const col = (pred: (x: string) => boolean) => enc.findIndex(pred);
    const cNum = col((x) => x.includes("factura")), cFecha = col((x) => x.startsWith("fecha")),
      cConc = col((x) => x.startsWith("concepto")), cValor = col((x) => x.includes("valor"));
    for (const r of filas.slice(h + 1)) {
      const numero = String(r[cNum] ?? "").trim().replace(/\s+/g, " ").toUpperCase();
      const valor = typeof r[cValor] === "number" ? (r[cValor] as number) : parseValor(String(r[cValor] ?? ""));
      const fecha = iso(r[cFecha]);
      if (!/^AGF\s*\d+/.test(numero) || !fecha || !(valor > 0)) continue;
      out.push({ id: numero, contrato, numero, fecha, concepto: String(r[cConc] ?? "").trim(), valor_total: valor, nota: null });
    }
  }
  return out;
}
