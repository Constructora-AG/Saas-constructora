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
import { num, type Servicio } from "@/lib/transporte/model";
import { TARIFARIO_EMERGENCIA_DEFAULT } from "@/lib/transporte/constants";
import { leerConciliacion, registroConciliacion } from "@/lib/transporte/conciliacion";
import { applyContractDates } from "@/lib/transporte/logic";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import { siguienteOrden } from "./ServicioForm";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

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
      const filas = leerConciliacion(await file.arrayBuffer());
      if (filas.length === 0) {
        setMsg({ ok: false, texto: "No se encontraron filas de conciliación (se esperan hojas con FECHA, VOLQUETA, MOVIMIENTO, ACTA, HORAS y GRUPO)." });
        return;
      }
      const nuevas = filas.filter((f) => !existentes.keys.has(f.key)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
      const tarifario = t.tarifario ?? TARIFARIO_EMERGENCIA_DEFAULT;
      const sig = siguienteOrden(t.servicesByMonth, t.ficha.prefijoOrden);
      const prefijo = sig.replace(/\d+$/, "");
      const base = parseInt(sig.replace(/\D/g, ""), 10);
      const sinTarifa = new Set<string>();
      const items: Array<{ monthKey: string; item: Servicio }> = [];
      nuevas.forEach((f) => {
        const item = registroConciliacion(f, `${prefijo}${String(base + items.length).padStart(4, "0")}`, tarifario);
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
