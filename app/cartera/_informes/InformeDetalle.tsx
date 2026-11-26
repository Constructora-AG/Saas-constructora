"use client";
// Vista de un informe de cartera: lectura completa + acciones de revisión.
import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACCION_LABEL,
  NOMBRE_PROYECTO,
  calcularResumen,
  carteraAtipica,
  faltantesParaEnviar,
  formatoVariacion,
  nombrePeriodo,
  type InformeResumen,
  type ResumenInforme,
} from "@/lib/cartera/informes";
import { IconAlert, IconChart, IconCoins, IconWallet } from "../../icons";
import { COP, Cumplimiento, EstadoBadge, ResumenTabla, fmtFechaHora, pct } from "./comun";
import { ReferenciaSmarthome } from "./ReferenciaSmarthome";

export type AccionRevision = "aprobar" | "devolver" | "reabrir";

type CampoComparado = "real" | "programado" | "mora" | "carteraTotal";
// Cartera total primero: es la que puede pedir explicación y debe verse sin desplazar la tabla.
const COMPARADOS: { key: CampoComparado; label: string }[] = [
  { key: "carteraTotal", label: "Cartera total" },
  { key: "mora", label: "Cartera en mora" },
  { key: "real", label: "Recaudo real" },
  { key: "programado", label: "Programado" },
];
const CELDA = { padding: "10px 12px" } as const;

/** Celda de comparación: variación (texto + flecha) y valor anterior. */
function Variacion({ actual, anterior }: { actual: number; anterior: number | undefined }) {
  if (anterior === undefined) return <span className="muted">Sin dato anterior</span>;
  const v = anterior > 0 ? (actual - anterior) / anterior : null;
  const txt = v === null ? (actual > 0 ? "Nuevo" : "Sin cambio") : Math.abs(v) < 0.005 ? "Sin cambio" : `${v > 0 ? "▲" : "▼"} ${formatoVariacion(v)}`;
  return (
    <span style={{ display: "block" }}>
      <b style={{ color: "var(--text)" }}>{txt}</b>
      <span className="cc-dias">antes {COP.format(anterior)}</span>
    </span>
  );
}

/** Cifras de este informe frente al informe anterior, con las explicaciones de lo atípico. */
function Comparacion({ informe, resumen, anterior }: { informe: InformeResumen; resumen: ResumenInforme; anterior: InformeResumen | null }) {
  if (!anterior) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No hay un informe anterior para comparar.</p>;
  const previo = calcularResumen(anterior.cifras, anterior.separaciones);
  // Solo se muestran las explicaciones que existen (ya no se exigen).
  const atipicos = carteraAtipica(informe.cifras, anterior).filter((a) => a.justificacion);
  return (
    <>
      <div className="table-wrap table-scroll">
        <table className="clean" aria-label={`Variación frente a ${nombrePeriodo(anterior.periodo)}`}>
          <thead>
            <tr>
              <th scope="col" style={CELDA}>Proyecto</th>
              {COMPARADOS.map((c) => <th key={c.key} scope="col" style={CELDA}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {resumen.proyectos.map((p) => {
              const ant = previo.proyectos.find((x) => x.proyecto === p.proyecto);
              const tenia = anterior.cifras.some((x) => x.proyecto === p.proyecto);
              return (
                <tr key={p.proyecto}>
                  <td style={{ ...CELDA, whiteSpace: "normal", minWidth: 120 }}><b>{p.nombre}</b></td>
                  {COMPARADOS.map((c) => {
                    return (
                      <td key={c.key} style={CELDA}>
                        <Variacion actual={p[c.key]} anterior={tenia && ant ? ant[c.key] : undefined} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {atipicos.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <b style={{ fontSize: 13, color: "var(--text)" }}>Explicaciones de quien subió el informe</b>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13 }}>
            {atipicos.map((a) => (
              <li key={a.proyecto}>
                <b>{NOMBRE_PROYECTO[a.proyecto]}</b> · cartera total {formatoVariacion(a.variacion)} ({COP.format(a.anterior)} → {COP.format(a.actual)}):{" "}
<span style={{ whiteSpace: "pre-wrap" }}>«{a.justificacion}»</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function InformeDetalle({
  informe,
  anterior,
  puedeRevisar,
  onEditar,
  onEliminar,
  onRevisar,
  onAbrirAdjunto,
  pie,
}: {
  informe: InformeResumen;
  /** Informe anterior más reciente, para la comparación (null si no hay). */
  anterior: InformeResumen | null;
  puedeRevisar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
  onRevisar: (accion: AccionRevision, nota: string) => Promise<string | null>;
  onAbrirAdjunto: () => void;
  /** Pie fijo del panel donde van las acciones (si no hay, quedan al final del contenido). */
  pie?: HTMLElement | null;
}) {
  const uid = useId();
  const resumen = useMemo(() => calcularResumen(informe.cifras, informe.separaciones), [informe]);
  const faltan = informe.estado === "borrador" ? faltantesParaEnviar(informe) : [];
  const [modo, setModo] = useState<"devolver" | "reabrir" | null>(null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<AccionRevision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = informe.estado === "borrador" || informe.estado === "observado";

  async function revisar(accion: AccionRevision) {
    setError(null);
    if (accion !== "aprobar" && !nota.trim()) {
      setError(accion === "devolver" ? "Escribe las observaciones para quien subió el informe." : "Escribe por qué se reabre el informe.");
      return;
    }
    setOcupado(accion);
    const err = await onRevisar(accion, nota.trim());
    setOcupado(null);
    if (err) setError(err);
    else { setModo(null); setNota(""); }
  }

  const sub = resumen.subtotal;
  const separacionesTotal = informe.separaciones.reduce((s, x) => s + x.valor, 0);
  const moraTotal = informe.mora_destacada.reduce((s, x) => s + x.valor, 0);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <EstadoBadge estado={informe.estado} />
        <span className="muted" style={{ fontSize: 12.5 }}>
          Registrado por <b>{informe.creado_por ?? "—"}</b>
          {informe.enviado_at && <> · enviado {fmtFechaHora(informe.enviado_at)}</>}
          {informe.revisado_por && informe.revisado_at && <> · última revisión: {informe.revisado_por}, {fmtFechaHora(informe.revisado_at)}</>}
        </span>
      </div>

      {informe.estado === "observado" && informe.observaciones && (
        <div className="info-bar" role="note" style={{ background: "var(--warn-soft)", color: "var(--text)" }}>
          <span aria-hidden="true" style={{ fontWeight: 700, color: "var(--warn)" }}>!</span>
          <div><b>Observaciones de la revisión:</b> <span style={{ whiteSpace: "pre-wrap" }}>{informe.observaciones}</span></div>
        </div>
      )}
      {faltan.length > 0 && (
        <div className="info-bar" role="note">
          <IconAlert />
          <div><b>Borrador incompleto.</b> Para enviarlo a revisión falta: {faltan.join("; ")}.</div>
        </div>
      )}

      {/* Solo para quien revisa, y primero: lo que más revisa es si el recaudo del mes coincide con Smarthome. */}
      {puedeRevisar && (
        <section aria-labelledby={`${uid}-sh`} style={{ display: "grid", gap: 8 }}>
          <h3 id={`${uid}-sh`} className="section-title" style={{ margin: 0 }}>Referencia Smarthome</h3>
          <ReferenciaSmarthome informe={informe} />
        </section>
      )}

      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCoins /></span><span className="kpi-label">Recaudo real</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(sub.real)}</div><div className="kpi-foot">programado {COP.format(sub.programado)}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-brand"><IconChart /></span><span className="kpi-label">Cumplimiento</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{pct(sub.cumplimiento)}</div><div className="kpi-foot">{sub.cumplimiento === null ? "sin recaudo programado" : sub.real >= sub.programado ? `superó la meta en ${COP.format(sub.real - sub.programado)}` : `faltaron ${COP.format(sub.programado - sub.real)}`}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconAlert /></span><span className="kpi-label">Cartera en mora</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(sub.mora)}</div><div className="kpi-foot">{pct(sub.indicadorCartera, "—")} de la cartera total</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico"><IconWallet /></span><span className="kpi-label">Cartera total</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(sub.carteraTotal)}</div><div className="kpi-foot">al cierre del mes</div></div>
      </div>

      <section aria-labelledby={`${uid}-cifras`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-cifras`} className="section-title" style={{ margin: 0 }}>Cifras por proyecto</h3>
        <ResumenTabla resumen={resumen} caption={`Cifras por proyecto de ${nombrePeriodo(informe.periodo)}`} />
        <span className="muted" style={{ fontSize: 12 }}>Recaudo real = recaudo pagado − separaciones · Ind. cartera = cartera en mora ÷ cartera total.</span>
      </section>

      <section aria-labelledby={`${uid}-comp`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-comp`} className="section-title" style={{ margin: 0 }}>
          Comparación con {anterior ? nombrePeriodo(anterior.periodo) : "el informe anterior"}
        </h3>
        <Comparacion informe={informe} resumen={resumen} anterior={anterior} />
      </section>

      <section aria-labelledby={`${uid}-sep`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-sep`} className="section-title" style={{ margin: 0 }}>Separaciones eliminadas del proyectado</h3>
        {informe.separaciones.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No se reportaron separaciones eliminadas.</p>
        ) : (
          <div className="table-wrap table-scroll">
            <table className="clean" aria-label="Separaciones eliminadas">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Proyecto</th><th scope="col">Lote / manzana</th><th scope="col" style={{ textAlign: "right" }}>Valor</th></tr></thead>
              <tbody>
                {informe.separaciones.map((s, i) => (
                  <tr key={i}>
                    <td><b>{s.cliente}</b></td>
                    <td>{NOMBRE_PROYECTO[s.proyecto]}</td>
                    <td>{[s.lote && `Lote ${s.lote}`, s.manzana && `Manzana ${s.manzana}`].filter(Boolean).join(", ") || "—"}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3} style={{ fontWeight: 600 }}>Total</td><td className="num" style={{ textAlign: "right" }}><b>{COP.format(separacionesTotal)}</b></td></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-mora`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-mora`} className="section-title" style={{ margin: 0 }}>Clientes en mora destacados</h3>
        {informe.mora_destacada.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No se destacaron clientes en mora.</p>
        ) : (
          <div className="table-wrap table-scroll">
            <table className="clean" aria-label="Clientes en mora destacados">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Proyecto</th><th scope="col">Detalle</th><th scope="col" style={{ textAlign: "right" }}>Valor en mora</th></tr></thead>
              <tbody>
                {informe.mora_destacada.map((m, i) => (
                  <tr key={i}>
                    <td><b>{m.cliente}</b><span className="cc-dias">{m.prospect_id ? "Vinculado a la cartera" : "Sin vincular"}</span></td>
                    <td>{NOMBRE_PROYECTO[m.proyecto]}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 180 }}>{m.detalle || "—"}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3} style={{ fontWeight: 600 }}>Total</td><td className="num" style={{ textAlign: "right" }}><b>{COP.format(moraTotal)}</b></td></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-analisis`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-analisis`} className="section-title" style={{ margin: 0 }}>Análisis del mes</h3>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--text-2)" }}>{informe.analisis || <span className="muted">{informe.adjunto_nombre ? "Sin análisis escrito; ver la presentación adjunta." : "Sin análisis."}</span>}</p>
        <h3 className="section-title" style={{ margin: "8px 0 0" }}>Propuestas y recomendaciones</h3>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--text-2)" }}>{informe.recomendaciones || <span className="muted">Sin recomendaciones.</span>}</p>
      </section>

      <section aria-labelledby={`${uid}-adj`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-adj`} className="section-title" style={{ margin: 0 }}>Presentación o soporte</h3>
        {informe.adjunto_nombre ? (
          <div><button type="button" className="btn btn-ghost btn-sm" onClick={onAbrirAdjunto}>Abrir «{informe.adjunto_nombre}»</button></div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Sin adjunto.</p>
        )}
      </section>

      <section aria-labelledby={`${uid}-hist`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-hist`} className="section-title" style={{ margin: 0 }}>Historial</h3>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 }}>
          {[...informe.historial].reverse().map((h, i) => (
            <li key={i}>
              <b>{ACCION_LABEL[h.accion] ?? h.accion}</b> · {h.por} · <span className="muted">{fmtFechaHora(h.at)}</span>
              {h.nota && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>«{h.nota}»</div>}
            </li>
          ))}
        </ol>
      </section>

      {/* Acciones: en el pie fijo del panel. */}
      {(() => { const acciones = (
      <div style={{ display: "grid", gap: 10 }}>
        {modo && (
          <label className="field">
            {modo === "devolver" ? "Observaciones para quien subió el informe *" : "Motivo para reabrir *"}
            <textarea className="input" rows={3} value={nota} autoFocus onChange={(e) => { setNota(e.target.value); setError(null); }}
              placeholder={modo === "devolver" ? "Ej. Revisar la cartera total de Aqua Etapa 1; no coincide con el mes anterior." : "Ej. Corregir el recaudo programado de Lotes."}
              style={{ resize: "vertical", fontFamily: "inherit" }} />
          </label>
        )}
        {error && <div role="alert" style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {informe.estado === "borrador" && <button type="button" className="btn btn-ghost" onClick={onEliminar}>Eliminar borrador</button>}
          {editable && <button type="button" className="btn btn-primary" onClick={onEditar}>{informe.estado === "observado" ? "Corregir informe" : "Continuar editando"}</button>}

          {informe.estado === "enviado" && !puedeRevisar && (
            <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>En revisión. Solo quien tiene el permiso «Revisar informes de cartera» puede aprobarlo o devolverlo.</span>
          )}
          {informe.estado === "enviado" && puedeRevisar && (
            modo === "devolver" ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={ocupado !== null} onClick={() => { setModo(null); setNota(""); setError(null); }}>Cancelar</button>
                <button type="button" className="btn btn-peligro" disabled={ocupado !== null} onClick={() => void revisar("devolver")}>{ocupado === "devolver" ? "Devolviendo…" : "Devolver con observaciones"}</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" disabled={ocupado !== null} onClick={() => setModo("devolver")}>Devolver con observaciones…</button>
                <button type="button" className="btn btn-primary" disabled={ocupado !== null} onClick={() => void revisar("aprobar")}>{ocupado === "aprobar" ? "Aprobando…" : "✓ Aprobar informe"}</button>
              </>
            )
          )}
          {informe.estado === "aprobado" && puedeRevisar && (
            modo === "reabrir" ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={ocupado !== null} onClick={() => { setModo(null); setNota(""); setError(null); }}>Cancelar</button>
                <button type="button" className="btn btn-primary" disabled={ocupado !== null} onClick={() => void revisar("reabrir")}>{ocupado === "reabrir" ? "Reabriendo…" : "Reabrir para corrección"}</button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setModo("reabrir")}>Reabrir…</button>
            )
          )}
          {informe.estado === "aprobado" && (
            <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
              <Cumplimiento valor={sub.cumplimiento} /> · Informe cerrado.
            </span>
          )}
        </div>
      </div>
      ); return pie ? createPortal(acciones, pie) : acciones; })()}
    </div>
  );
}
