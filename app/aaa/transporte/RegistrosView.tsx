"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Vista Registros / Servicios (SPEC §5.2)
// - Pestañas por mes de la vigencia (segmented) + toolbar del mes.
// - Tabla del mes (table.clean, scroll horizontal responsive) con las
//   columnas del SPEC: fecha, tipo, área AAA, placa, capacidad,
//   conductor, equipo, área/destino, valor, peajes, soportes (chips que
//   abren el adjunto), V°B°, facturación (toggle), aprobó y acciones.
// - Acciones por fila: orden de servicio PDF (pdf-lib), duplicar
//   (no copia fecha/adjuntos/checkboxes), editar, eliminar.
// - Exportación mensual (SPEC §5.2): checkbox «Solo pendientes por
//   facturar» + CSV / Excel / PDF con soportes (lib/transporte/export)
//   y pregunta de facturación (askInvoice, SPEC §4.7).
// - Formulario en drawer (ServicioForm): t.setModalOpen pausa el polling.
// ════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { IconDownload } from "../../icons";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import type { Servicio } from "@/lib/transporte/model";
import { aprobadorDe, areaAAADe, num } from "@/lib/transporte/model";
import { fdate, fmtCOP, totales } from "@/lib/transporte/logic";
import { openAttachment } from "@/lib/transporte/media";
import { exportServicios, type ExportFormat, type ExportPair } from "@/lib/transporte/export";
import { ServicioForm } from "./ServicioForm";
import { buildOrderPdf } from "./ordenPdf";

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  Programado: { label: "Programado", cls: "ok" },
  "No Programado": { label: "No Progr.", cls: "warn" },
  Emergencia: { label: "Emergencia", cls: "high" },
};

const chipBtn: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  font: "inherit",
};

export function RegistrosView({ t }: ViewProps) {
  const [form, setForm] = useState<{ editing: Servicio | null; dupFrom: Servicio | null } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Servicio | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  // Exportación mensual (SPEC §5.2): solo pendientes por defecto.
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [exportando, setExportando] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const mes = t.activeMonth;
  const items = useMemo(
    () => [...t.activeServices].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [t.activeServices],
  );
  const tot = useMemo(() => totales(items), [items]);
  const diasMes = mes ? new Date(mes.year, mes.month + 1, 0).getDate() : 0;

  const abrir = (editing: Servicio | null, dupFrom: Servicio | null) => {
    setRowError(null);
    setGuardado(null);
    setForm({ editing, dupFrom });
    t.setModalOpen(true); // pausa el polling mientras el drawer esté abierto
  };
  const cerrar = () => {
    setForm(null);
    t.setModalOpen(false);
  };

  const eliminar = async (s: Servicio) => {
    if (!mes) return;
    if (!window.confirm("¿Eliminar este registro de servicio? Esta acción no se puede deshacer.")) return;
    setRowError(null);
    try {
      await t.deleteService(mes.key, s.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "No se pudo eliminar el servicio.");
    }
  };

  const facturado = async (s: Servicio) => {
    if (!mes) return;
    setRowError(null);
    try {
      await t.toggleInvoiced(mes.key, s.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "No se pudo cambiar el estado de facturación.");
    }
  };

  const ordenPdf = async (s: Servicio) => {
    setRowError(null);
    setPdfBusy(s.id);
    try {
      await buildOrderPdf(s, t.tarifario, mes?.label ?? "");
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "No se pudo generar la orden de servicio en PDF.");
    } finally {
      setPdfBusy(null);
    }
  };

  // ── Exportación mensual con flujo de facturación (SPEC §4.7) ─────
  const exportarMes = async (fmt: ExportFormat) => {
    if (!mes) return;
    const pares: ExportPair[] = items
      .filter((s) => !soloPendientes || !s.invoiced)
      .map((item) => ({ monthKey: mes.key, monthLabel: mes.label, item }));
    setExportError(null);
    setExportando(fmt);
    try {
      const totalGlobalValue = t.months.reduce(
        (acc, m) => acc + (t.servicesByMonth[m.key] ?? []).reduce((s, it) => s + num(it.value), 0),
        0,
      );
      const finIncl = new Date(
        t.contractEndExclusive.getFullYear(),
        t.contractEndExclusive.getMonth(),
        t.contractEndExclusive.getDate() - 1,
      );
      const fF = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
      await exportServicios(pares, fmt, `servicios_${mes.key}`, mes.label, {
        vigencia: `${fF(t.contractStart)} - ${fF(finIncl)}`,
        totalGlobalValue,
      });
      // askInvoice: ¿marcar los pendientes exportados como facturados?
      const pendientes = pares.filter((p) => !p.item.invoiced);
      if (pendientes.length > 0 &&
        window.confirm(`¿Marcar los ${pendientes.length} servicio(s) pendientes exportados como facturados?`)) {
        await t.markInvoiced(pendientes.map((p) => ({ monthKey: p.monthKey, id: p.item.id })));
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(null);
    }
  };

  if (!mes) {
    return (
      <div className="table-wrap" style={{ padding: 18 }}>
        <span className="muted">La vigencia del contrato aún no tiene meses configurados.</span>
      </div>
    );
  }

  return (
    <>
      {/* Pestañas por mes de la vigencia */}
      <div className="filters-bar" style={{ marginTop: 0 }}>
        <div className="segmented" style={{ flexWrap: "wrap" }}>
          {t.months.map((m, i) => (
            <button
              key={m.key}
              className={`seg${i === t.activeMonthIdx ? " active" : ""}`}
              onClick={() => t.setActiveMonthIdx(i)}
              title={m.label}
            >
              {m.label.split(" ")[0].slice(0, 3)} {String(m.year).slice(2)}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar del mes + botón de registro */}
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Servicios de {mes.label}</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5, textTransform: "none", letterSpacing: 0 }}>
          Servicios: {tot.servicios} · Valor del mes: {fmtCOP(tot.valor)} · Peajes del mes: {fmtCOP(tot.peajes)} · Días del mes: {diasMes}
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => abrir(null, null)}>+ Agregar servicio</button>
      </div>

      {/* Exportación mensual (SPEC §5.2) */}
      <div className="toolbar" style={{ alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo pendientes por facturar
        </label>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarMes("csv")}>
          <IconDownload width={15} height={15} /> {exportando === "csv" ? "Exportando…" : "CSV"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarMes("xlsx")}>
          <IconDownload width={15} height={15} /> {exportando === "xlsx" ? "Exportando…" : "Excel"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarMes("pdf")}>
          <IconDownload width={15} height={15} /> {exportando === "pdf" ? "Generando…" : "PDF con soportes"}
        </button>
      </div>
      {exportError && <div style={{ color: "var(--high)", fontSize: 13, margin: "0 0 10px" }}>{exportError}</div>}

      {rowError && <div style={{ color: "var(--high)", fontSize: 13, margin: "0 0 10px" }}>{rowError}</div>}

      {guardado && (
        <div className="info-bar" style={{ marginBottom: 12 }}>
          <div>
            <b>Servicio guardado.</b> Descarga la orden de servicio para imprimir, o la información pendiente por facturar.
          </div>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={pdfBusy === guardado.id} onClick={() => void ordenPdf(guardado)}>
            {pdfBusy === guardado.id ? "Generando…" : "Orden de servicio PDF"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setGuardado(null)}>Cerrar</button>
        </div>
      )}

      {/* Tabla del mes */}
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Área AAA</th>
              <th>Placa</th>
              <th style={{ textAlign: "right" }}>Cap.</th>
              <th>Conductor</th>
              <th>Equipo</th>
              <th>Área / Destino</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th style={{ textAlign: "right" }}>Peajes</th>
              <th>Soportes</th>
              <th>V°B°</th>
              <th>Facturación</th>
              <th>Aprobó</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={15} className="muted" style={{ padding: 18 }}>
                  Aún no hay servicios registrados en {mes.label}. Usa &laquo;Agregar servicio&raquo; para comenzar.
                </td>
              </tr>
            )}
            {items.map((s) => {
              const tipo = TIPO_BADGE[String(s.serviceType)] ?? { label: String(s.serviceType || "—"), cls: "warn" };
              return (
                <tr key={s.id}>
                  <td><b>{s.date ? fdate(s.date) : "—"}</b>{s.orderNo && <span className="cc-dias">{s.orderNo}</span>}</td>
                  <td><span className={`badge ${tipo.cls}`}>{tipo.label}</span></td>
                  <td>{areaAAADe(s) || "—"}</td>
                  <td>{s.plate || "—"}</td>
                  <td className="num" style={{ textAlign: "right" }}>{s.capacity !== "" && s.capacity != null ? `${num(s.capacity)} T` : "—"}</td>
                  <td>{s.driver || "—"}</td>
                  <td>{s.equipment || "—"}</td>
                  <td>{s.area || s.destination || "—"}</td>
                  <td className="num" style={{ textAlign: "right" }}><b>{fmtCOP(s.value)}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{fmtCOP(s.tolls)}</td>
                  <td>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                      {(s.photoFiles ?? []).map((file, i) => (
                        <button
                          key={`${s.id}-f${i}`}
                          className="badge"
                          style={{ ...chipBtn, background: "var(--brand-soft)", color: "var(--brand)" }}
                          onClick={() => openAttachment(file)}
                          title={`Abrir ${file.name}`}
                        >
                          {file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "PDF" : "Foto"} {i + 1}
                        </button>
                      ))}
                      {s.approvalFile && (
                        <button
                          className="badge ok"
                          style={chipBtn}
                          onClick={() => s.approvalFile && openAttachment(s.approvalFile)}
                          title={`Abrir V°B°: ${s.approvalFile.name}`}
                        >
                          V°B°
                        </button>
                      )}
                      {!(s.photoFiles?.length || s.approvalFile) && <span className="muted">—</span>}
                    </span>
                  </td>
                  <td><span className={`badge ${s.approved ? "ok" : "warn"}`}>{s.approved ? "Sí" : "No"}</span></td>
                  <td>
                    <button
                      className={`badge ${s.invoiced ? "ok" : "warn"}`}
                      style={chipBtn}
                      onClick={() => void facturado(s)}
                      title={s.invoiced ? "Clic para marcar como pendiente" : "Clic para marcar como facturado"}
                    >
                      {s.invoiced ? "Facturado" : "Pendiente"}
                    </button>
                  </td>
                  <td>{aprobadorDe(s) || "—"}</td>
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-sm" disabled={pdfBusy === s.id} onClick={() => void ordenPdf(s)} title="Orden de servicio PDF">
                      {pdfBusy === s.id ? "…" : "Orden"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(null, s)} title="Duplicar (no copia fecha, adjuntos ni estados)">Duplicar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(s, null)} title="Editar">Editar</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void eliminar(s)} title="Eliminar">Eliminar</button>
                  </td>
                </tr>
              );
            })}
            {items.length > 0 && (
              <tr style={{ background: "var(--surface-2)" }}>
                <td><b>Total</b></td>
                <td colSpan={7}></td>
                <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{fmtCOP(tot.valor)}</td>
                <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{fmtCOP(tot.peajes)}</td>
                <td colSpan={5} className="muted">{tot.pendientes} pendiente(s) por facturar · {fmtCOP(tot.valorPendiente)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario de servicio en drawer */}
      {form && (
        <ServicioForm
          t={t}
          month={mes}
          editing={form.editing}
          dupFrom={form.dupFrom}
          onClose={cerrar}
          onSaved={(item) => {
            cerrar();
            setGuardado(item);
          }}
        />
      )}
    </>
  );
}
