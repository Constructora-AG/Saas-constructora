"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Vista Registros / Servicios (SPEC §5.2)
// - Pestañas por mes visibles de la vigencia (segmented) + toolbar del mes.
// - Tabla del mes ADAPTADA AL ANCHO de pantalla (sin scroll horizontal):
//   columnas configurables (mostrar/ocultar, persistidas en localStorage),
//   paginación de 10 registros y acciones por fila en un menú compacto.
// - Acciones por fila: orden de servicio PDF (pdf-lib), duplicar
//   (no copia fecha/adjuntos/checkboxes), editar, eliminar.
// - Exportación mensual (SPEC §5.2): checkbox «Solo pendientes por
//   facturar» + CSV / Excel / PDF con soportes (lib/transporte/export)
//   y pregunta de facturación (askInvoice, SPEC §4.7).
// - Formulario en drawer (ServicioForm): t.setModalOpen pausa el polling.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
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

const chipBtn: React.CSSProperties = { border: "none", cursor: "pointer", font: "inherit" };

const PAGE_SIZE = 10;
const COLS_KEY = "transporte.registros.columnas.v1";

type ColId =
  | "fecha" | "tipo" | "area" | "placa" | "cap" | "conductor" | "equipo" | "destino"
  | "valor" | "peajes" | "soportes" | "vobo" | "factura" | "aprobo" | "acciones";
interface Columna { id: ColId; label: string; fija?: boolean; w: number; num?: boolean }

/** Fecha compacta para la tabla: "01 sep 2026". */
const fechaCorta = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return fdate(iso);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${m[3]} ${meses[+m[2] - 1]} ${m[1]}`;
};

/** Orden secundario estable (número de registro del mes, si existe). */
const seqDe = (s: Servicio) => Number((s as unknown as { seq?: number }).seq ?? 0);

/** Columnas de la tabla. `fija` = no se puede ocultar. `w` = ancho relativo (table-layout fixed). */
const COLUMNAS: ReadonlyArray<Columna> = [
  { id: "fecha", label: "Fecha", fija: true, w: 7 },
  { id: "tipo", label: "Tipo", w: 7 },
  { id: "area", label: "Área AAA", w: 12 },
  { id: "placa", label: "Placa", w: 6 },
  { id: "cap", label: "Cap.", w: 5, num: true },
  { id: "conductor", label: "Conductor", w: 10 },
  { id: "equipo", label: "Equipo", w: 11 },
  { id: "destino", label: "Destino", w: 12 },
  { id: "valor", label: "Valor", w: 8, num: true },
  { id: "peajes", label: "Peajes", w: 6, num: true },
  { id: "soportes", label: "Soportes", w: 11 },
  { id: "vobo", label: "V°B°", w: 4 },
  { id: "factura", label: "Factura", w: 7 },
  { id: "aprobo", label: "Aprobó", w: 7 },
  { id: "acciones", label: "", fija: true, w: 4 },
];
const OCULTAS_DEFAULT: ColId[] = ["tipo", "cap", "peajes", "aprobo"];

function leerOcultas(): Set<ColId> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(COLS_KEY) : null;
    if (raw) return new Set(JSON.parse(raw) as ColId[]);
  } catch { /* sin storage */ }
  return new Set(OCULTAS_DEFAULT);
}

export function RegistrosView({ t }: ViewProps) {
  const [form, setForm] = useState<{ editing: Servicio | null; dupFrom: Servicio | null } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<Servicio | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  // Exportación mensual (SPEC §5.2): solo pendientes por defecto.
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [exportando, setExportando] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Columnas visibles, paginación y menú de acciones
  const [ocultas, setOcultas] = useState<Set<ColId>>(() => new Set(OCULTAS_DEFAULT));
  const [colPickOpen, setColPickOpen] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const colPickRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setOcultas(leerOcultas()); }, []);
  useEffect(() => {
    const cerrarMenus = (e: MouseEvent) => {
      if (colPickRef.current && !colPickRef.current.contains(e.target as Node)) setColPickOpen(false);
      if (!(e.target as HTMLElement).closest?.(".rowmenu")) setMenuId(null);
    };
    document.addEventListener("mousedown", cerrarMenus);
    return () => document.removeEventListener("mousedown", cerrarMenus);
  }, []);

  const mes = t.activeMonth;
  const items = useMemo(
    () => [...t.activeServices].sort((a, b) => (a.date || "").localeCompare(b.date || "") || seqDe(a) - seqDe(b)),
    [t.activeServices],
  );
  const tot = useMemo(() => totales(items), [items]);
  const diasMes = mes ? new Date(mes.year, mes.month + 1, 0).getDate() : 0;

  // Paginación (10 por página); vuelve a la página 1 al cambiar de mes
  useEffect(() => { setPagina(1); }, [mes?.key]);
  const totalPaginas = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(() => items.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE), [items, paginaActual]);

  const columnas = useMemo(() => COLUMNAS.filter((c) => !ocultas.has(c.id)), [ocultas]);
  const anchoTotal = columnas.reduce((a, c) => a + c.w, 0);
  const ver = (id: ColId) => !ocultas.has(id);
  const toggleCol = (id: ColId) => {
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* sin storage */ }
      return next;
    });
  };
  const restablecerCols = () => {
    setOcultas(new Set(OCULTAS_DEFAULT));
    try { window.localStorage.removeItem(COLS_KEY); } catch { /* sin storage */ }
  };

  const abrir = (editing: Servicio | null, dupFrom: Servicio | null) => {
    setRowError(null);
    setGuardado(null);
    setMenuId(null);
    setForm({ editing, dupFrom });
    t.setModalOpen(true); // pausa el polling mientras el drawer esté abierto
  };
  const cerrar = () => {
    setForm(null);
    t.setModalOpen(false);
  };

  const eliminar = async (s: Servicio) => {
    if (!mes) return;
    setMenuId(null);
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
    setMenuId(null);
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
      const totalGlobalValue = t.allMonths.reduce(
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

  const desde = items.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(items.length, paginaActual * PAGE_SIZE);
  const paginas = useMemo(() => {
    // Ventana de páginas: 1 … (actual-1, actual, actual+1) … última
    const set = new Set<number>([1, totalPaginas, paginaActual - 1, paginaActual, paginaActual + 1]);
    return [...set].filter((p) => p >= 1 && p <= totalPaginas).sort((a, b) => a - b);
  }, [paginaActual, totalPaginas]);

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
              {(t.servicesByMonth[m.key]?.length ?? 0) > 0 && (
                <span className="seg-count">{t.servicesByMonth[m.key].length}</span>
              )}
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

      {/* Exportación mensual (SPEC §5.2) + selector de columnas */}
      <div className="toolbar" style={{ alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo pendientes por facturar
        </label>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <div className="colpick" ref={colPickRef}>
          <button className={`btn btn-ghost btn-sm${colPickOpen ? " active" : ""}`} onClick={() => setColPickOpen((v) => !v)} title="Mostrar u ocultar columnas">
            ☷ Columnas{ocultas.size > 0 && <span className="seg-count">{COLUMNAS.length - ocultas.size}/{COLUMNAS.length}</span>}
          </button>
          {colPickOpen && (
            <div className="colpick-menu">
              <div className="colpick-title">Columnas visibles</div>
              {COLUMNAS.filter((c) => c.label).map((c) => (
                <label key={c.id} className={`colpick-item${c.fija ? " fija" : ""}`}>
                  <input type="checkbox" checked={ver(c.id)} disabled={!!c.fija} onChange={() => toggleCol(c.id)} />
                  {c.label}
                </label>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, width: "100%" }} onClick={restablecerCols}>Restablecer</button>
            </div>
          )}
        </div>
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

      {/* Tabla del mes: ajustada al ancho, sin scroll horizontal */}
      <div className="table-wrap tbl-fit-wrap">
        <table className="clean tbl-fit">
          <colgroup>
            {columnas.map((c) => <col key={c.id} style={{ width: `${(c.w / anchoTotal) * 100}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.id} style={c.num ? { textAlign: "right" } : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="muted" style={{ padding: 18 }}>
                  Aún no hay servicios registrados en {mes.label}. Usa &laquo;Agregar servicio&raquo; para comenzar.
                </td>
              </tr>
            )}
            {visibles.map((s) => {
              const tipo = TIPO_BADGE[String(s.serviceType)] ?? { label: String(s.serviceType || "—"), cls: "warn" };
              const fotos = s.photoFiles ?? [];
              return (
                <tr key={s.id}>
                  {ver("fecha") && (
                    <td>
                      <b>{s.date ? fechaCorta(s.date) : "—"}</b>
                      {s.orderNo && <span className="sub">N° {s.orderNo}</span>}
                      {!ver("tipo") && s.serviceType && s.serviceType !== "Programado" && (
                        <div><span className={`badge ${tipo.cls}`}>{tipo.label}</span></div>
                      )}
                    </td>
                  )}
                  {ver("tipo") && <td><span className={`badge ${tipo.cls}`}>{tipo.label}</span></td>}
                  {ver("area") && <td title={areaAAADe(s) || ""}><span className="clamp">{areaAAADe(s) || "—"}</span></td>}
                  {ver("placa") && (
                    <td>
                      <b>{s.plate || "—"}</b>
                      {!ver("cap") && s.capacity !== "" && s.capacity != null && <span className="sub">{num(s.capacity)} T</span>}
                    </td>
                  )}
                  {ver("cap") && <td className="num" style={{ textAlign: "right" }}>{s.capacity !== "" && s.capacity != null ? `${num(s.capacity)} T` : "—"}</td>}
                  {ver("conductor") && <td title={s.driver || ""}><span className="clamp">{s.driver || "—"}</span></td>}
                  {ver("equipo") && <td title={s.equipment || ""}><span className="clamp">{s.equipment || "—"}</span></td>}
                  {ver("destino") && (
                    <td title={[s.pickup, s.destination].filter(Boolean).join(" → ")}>
                      <span className="clamp">{s.area || s.destination || "—"}</span>
                      {s.destination && s.area && s.destination !== s.area && (
                        <span className="sub clamp">{s.destination}</span>
                      )}
                    </td>
                  )}
                  {ver("valor") && (
                    <td className="num" style={{ textAlign: "right" }}>
                      <b>{fmtCOP(s.value)}</b>
                      {!ver("peajes") && num(s.tolls) > 0 && <span className="sub">+ {fmtCOP(s.tolls)} peajes</span>}
                    </td>
                  )}
                  {ver("peajes") && <td className="num" style={{ textAlign: "right" }}>{fmtCOP(s.tolls)}</td>}
                  {ver("soportes") && (
                    <td>
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                        {fotos.slice(0, 3).map((file, i) => (
                          <button
                            key={`${s.id}-f${i}`}
                            className="thumb-chip"
                            onClick={() => openAttachment(file)}
                            title={`Abrir ${file.name}`}
                          >
                            {file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? (
                              <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>PDF</span>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.dataUrl} alt={file.name} loading="lazy" />
                            )}
                          </button>
                        ))}
                        {fotos.length > 3 && <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>+{fotos.length - 3}</span>}
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
                        {!(fotos.length || s.approvalFile) && <span className="muted">—</span>}
                      </span>
                    </td>
                  )}
                  {ver("vobo") && <td><span className={`badge ${s.approved ? "ok" : "warn"}`}>{s.approved ? "Sí" : "No"}</span></td>}
                  {ver("factura") && (
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
                  )}
                  {ver("aprobo") && <td><span className="clamp">{aprobadorDe(s) || "—"}</span></td>}
                  {ver("acciones") && (
                    <td className="row-actions" style={{ textAlign: "right" }}>
                      <div className={`rowmenu${menuId === s.id ? " open" : ""}`}>
                        <button className="btn btn-ghost btn-sm rowmenu-btn" onClick={() => setMenuId(menuId === s.id ? null : s.id)} title="Acciones" aria-label="Acciones">⋯</button>
                        {menuId === s.id && (
                          <div className="rowmenu-list">
                            <button disabled={pdfBusy === s.id} onClick={() => void ordenPdf(s)}>{pdfBusy === s.id ? "Generando…" : "Orden de servicio PDF"}</button>
                            <button onClick={() => abrir(s, null)}>Editar</button>
                            <button onClick={() => abrir(null, s)} title="No copia fecha, adjuntos ni estados">Duplicar</button>
                            <button className="danger" onClick={() => void eliminar(s)}>Eliminar</button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length > 0 && (() => {
              // Fila de totales alineada con las columnas visibles
              const iVal = columnas.findIndex((c) => c.id === "valor");
              const iPea = columnas.findIndex((c) => c.id === "peajes");
              const lead = iVal >= 0 ? iVal : iPea >= 0 ? iPea : columnas.length;
              const trailing = columnas.length - lead - (iVal >= 0 ? 1 : 0) - (iPea >= 0 ? 1 : 0);
              return (
                <tr style={{ background: "var(--surface-2)" }}>
                  <td colSpan={Math.max(1, lead)}><b>Total del mes</b>{lead === columnas.length && <span className="muted"> · {fmtCOP(tot.valor)}</span>}</td>
                  {iVal >= 0 && <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{fmtCOP(tot.valor)}</td>}
                  {iPea >= 0 && <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{fmtCOP(tot.peajes)}</td>}
                  {trailing > 0 && (
                    <td colSpan={trailing} className="muted">
                      {tot.pendientes} pendiente(s) por facturar · {fmtCOP(tot.valorPendiente)}
                    </td>
                  )}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {items.length > 0 && (
        <div className="pager">
          <span className="muted">Mostrando {desde}–{hasta} de {items.length} servicios</span>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>‹ Anterior</button>
          {paginas.map((p, i) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {i > 0 && paginas[i - 1] !== p - 1 && <span className="muted">…</span>}
              <button className={`btn btn-sm ${p === paginaActual ? "btn-primary" : "btn-ghost"}`} onClick={() => setPagina(p)}>{p}</button>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente ›</button>
        </div>
      )}

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
