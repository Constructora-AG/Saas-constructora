"use client";
// ════════════════════════════════════════════════════════════════════
// Informe mensual de cartera dentro de la página /cartera.
// Hay un solo informe por mes: una franja muestra el estado del informe
// del mes cerrado y la acción que le toca a cada quien (registrar,
// continuar, corregir, revisar o ver). El formulario, la revisión y el
// historial se abren en el panel lateral, como la ficha de un cliente.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ConfirmarEliminacion } from "@/app/components/ConfirmarEliminacion";
import {
  EVENTO_INFORMES,
  calcularResumen,
  informeAnterior,
  nombrePeriodo,
  type AdjuntoInforme,
  type InformeResumen,
} from "@/lib/cartera/informes";
import { IconAlert, IconChart } from "../../icons";
import { COP, Cumplimiento, EstadoBadge, abrirAdjunto, fmtFechaHora, pct } from "./comun";
import { InformeForm, type ClienteCartera, type GuardarInforme } from "./InformeForm";
import { InformeDetalle, type AccionRevision } from "./InformeDetalle";
import { CuadroAnual } from "./CuadroAnual";

export type { ClienteCartera };

type Panel = { modo: "historial" } | { modo: "cuadro" } | { modo: "nuevo" } | { modo: "editar"; id: string } | { modo: "ver"; id: string } | null;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; faltan?: string[] };
  if (!res.ok) {
    const extra = body.faltan?.length ? `: ${body.faltan.join("; ")}` : "";
    throw new Error((body.error ?? `Error ${res.status}`) + extra);
  }
  return body;
}

/** Mes que corresponde informar: el mes anterior al actual (YYYY-MM-01). */
function periodoAInformar(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function InformeMensual({ clientes, puedeRevisar }: { clientes: ClienteCartera[]; puedeRevisar: boolean }) {
  const [informes, setInformes] = useState<InformeResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sucio, setSucio] = useState(false);
  // Al confirmar «descartar cambios», a dónde ir (null = cerrar el panel).
  const [descartarHacia, setDescartarHacia] = useState<Panel | undefined>(undefined);
  const confirmarDescartar = descartarHacia !== undefined;
  const [porEliminar, setPorEliminar] = useState<InformeResumen | null>(null);
  // Pie fijo del panel: las vistas dibujan ahí sus acciones (siempre al borde inferior, sin tapar contenido).
  const [pie, setPie] = useState<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await api<{ informes: InformeResumen[] }>("/api/cartera/informes");
      setInformes(r.informes);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron cargar los informes");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const actual = panel && (panel.modo === "ver" || panel.modo === "editar") ? informes.find((i) => i.id === panel.id) ?? null : null;
  const editando = panel?.modo === "nuevo" || panel?.modo === "editar";

  /** Cambia de panel; si hay cambios sin guardar, pide confirmación primero. */
  const ir = useCallback((destino: Panel) => {
    if (editando && sucio) { setDescartarHacia(destino); return; }
    setSucio(false);
    setPanel(destino);
  }, [editando, sucio]);
  const cerrar = useCallback(() => ir(null), [ir]);

  // Esc cierra el panel (si hay cambios sin guardar, pide confirmación).
  useEffect(() => {
    if (!panel || confirmarDescartar || porEliminar) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, cerrar, confirmarDescartar, porEliminar]);

  const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_INFORMES));
  const reemplazar = (inf: InformeResumen) => {
    setInformes((arr) => [inf, ...arr.filter((x) => x.id !== inf.id)].sort((a, b) => b.periodo.localeCompare(a.periodo)));
    avisarCambio();
  };

  // ── Acciones ──
  async function guardar(datos: GuardarInforme, enviar: boolean): Promise<string | null> {
    try {
      let inf: InformeResumen;
      if (panel?.modo === "editar") {
        inf = (await api<{ informe: InformeResumen }>("/api/cartera/informes", { method: "PATCH", body: JSON.stringify({ id: panel.id, accion: enviar ? "enviar" : "guardar", ...datos }) })).informe;
      } else {
        inf = (await api<{ informe: InformeResumen }>("/api/cartera/informes", { method: "POST", body: JSON.stringify({ ...datos, enviar }) })).informe;
      }
      reemplazar(inf);
      setSucio(false);
      setPanel({ modo: "ver", id: inf.id });
      setMsg(enviar ? `Informe de ${nombrePeriodo(inf.periodo)} enviado a revisión.` : `Borrador de ${nombrePeriodo(inf.periodo)} guardado.`);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "No se pudo guardar";
    }
  }

  async function revisar(inf: InformeResumen, accion: AccionRevision, nota: string): Promise<string | null> {
    try {
      const r = await api<{ informe: InformeResumen }>("/api/cartera/informes", { method: "PATCH", body: JSON.stringify({ id: inf.id, accion, nota }) });
      reemplazar(r.informe);
      const txt = accion === "aprobar" ? "aprobado" : accion === "devolver" ? "devuelto con observaciones" : "reabierto para corrección";
      setMsg(`Informe de ${nombrePeriodo(inf.periodo)} ${txt}.`);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "No se pudo completar la acción";
    }
  }

  async function eliminar(inf: InformeResumen) {
    await api<{ ok: boolean }>(`/api/cartera/informes?id=${encodeURIComponent(inf.id)}`, { method: "DELETE" });
    setInformes((arr) => arr.filter((x) => x.id !== inf.id));
    avisarCambio();
    setPanel(null);
    setMsg(`Borrador de ${nombrePeriodo(inf.periodo)} eliminado.`);
  }

  async function verAdjunto(id: string) {
    // La pestaña se abre en el clic para que el navegador no la bloquee.
    const ventana = window.open("", "_blank");
    try {
      const r = await api<{ informe: InformeResumen & { adjunto: AdjuntoInforme | null } }>(`/api/cartera/informes?id=${encodeURIComponent(id)}`);
      if (!r.informe.adjunto) throw new Error("El informe no tiene adjunto");
      abrirAdjunto(r.informe.adjunto, ventana);
    } catch (e) {
      ventana?.close();
      setMsg(null);
      setErrorCarga(e instanceof Error ? e.message : "No se pudo abrir el adjunto");
    }
  }

  /** Abre un informe donde corresponde: edición si está en borrador/observado, si no, lectura. */
  const abrir = (i: InformeResumen) =>
    ir(i.estado === "borrador" || i.estado === "observado" ? { modo: "editar", id: i.id } : { modo: "ver", id: i.id });

  // ── Franja del mes ──
  const periodo = periodoAInformar();
  // La tarjeta muestra el último informe registrado (la lista viene del más reciente al más antiguo).
  const ultimo = informes[0] ?? null;
  const subUltimo = ultimo ? calcularResumen(ultimo.cifras, ultimo.separaciones).subtotal : null;
  // ¿Falta el informe del mes cerrado? (se avisa; se crea con «Nuevo informe»).
  const faltaDelMes = !cargando && !errorCarga && !informes.some((i) => i.periodo === periodo);
  // Todo lo que espera acción de este usuario: quien revisa, los enviados;
  // el equipo de cartera, los devueltos con observaciones.
  const pendientes = informes.filter((i) => (puedeRevisar ? i.estado === "enviado" : i.estado === "observado"));
  // «Nuevo informe» propone el mes cerrado; si ya existe, el mes en curso.
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const periodoSugerido = faltaDelMes ? periodo.slice(0, 7) : mesActual;

  let detalle: ReactNode = null;
  let accion: { texto: string; primaria: boolean; onClick: () => void } | null = null;
  if (cargando && informes.length === 0) {
    detalle = <span className="muted">Cargando informes…</span>;
  } else if (errorCarga && informes.length === 0) {
    detalle = <span style={{ color: "var(--high)" }}>{errorCarga}</span>;
    accion = { texto: "Reintentar", primaria: false, onClick: () => void cargar() };
  } else if (!ultimo) {
    detalle = <>Aún no hay informes registrados. Usa «Nuevo informe» para registrar el de {nombrePeriodo(periodo)}.</>;
  } else if (ultimo.estado === "borrador") {
    detalle = <>Borrador de {ultimo.creado_por ?? "—"} · actualizado {fmtFechaHora(ultimo.updated_at)}</>;
    accion = { texto: "Continuar informe", primaria: true, onClick: () => abrir(ultimo) };
  } else if (ultimo.estado === "observado") {
    detalle = <>Devuelto por {ultimo.revisado_por ?? "—"}: <i>«{(ultimo.observaciones ?? "").slice(0, 120)}{(ultimo.observaciones ?? "").length > 120 ? "…" : ""}»</i></>;
    accion = { texto: "Corregir informe", primaria: true, onClick: () => abrir(ultimo) };
  } else if (ultimo.estado === "enviado") {
    detalle = <>Enviado por {ultimo.creado_por ?? "—"} el {fmtFechaHora(ultimo.enviado_at)}{puedeRevisar ? " · espera tu revisión" : " · en revisión"}</>;
    accion = { texto: puedeRevisar ? "Revisar informe" : "Ver informe", primaria: puedeRevisar, onClick: () => abrir(ultimo) };
  } else {
    detalle = <>Aprobado por {ultimo.revisado_por ?? "—"} · recaudo {COP.format(subUltimo!.real)} · mora {COP.format(subUltimo!.mora)}</>;
    accion = { texto: "Ver informe", primaria: false, onClick: () => abrir(ultimo) };
  }

  const tituloPanel =
    panel?.modo === "historial" ? "Informes mensuales de cartera"
      : panel?.modo === "cuadro" ? "Cuadro anual de recaudo y mora"
      : panel?.modo === "nuevo" ? "Nuevo informe mensual"
        : panel?.modo === "editar" && actual ? `Editar informe · ${nombrePeriodo(actual.periodo)}`
          : actual ? `Informe de cartera · ${nombrePeriodo(actual.periodo)}` : "";

  return (
    <>
      <section id="informe-mensual" aria-labelledby="informe-mensual-titulo" style={{ marginBottom: 16, display: "grid", gap: 10 }}>
        {/* Acciones generales: crear un informe nuevo y ver todos los anteriores. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 id="informe-mensual-titulo" className="section-title" style={{ margin: 0 }}>Informe mensual de cartera</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ir({ modo: "cuadro" })} disabled={cargando && informes.length === 0}>
              Cuadro anual
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ir({ modo: "historial" })} disabled={cargando && informes.length === 0}>
              Historial de informes ({informes.length})
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ir({ modo: "nuevo" })} disabled={cargando && informes.length === 0}>
              + Nuevo informe
            </button>
          </div>
        </div>

        {/* Revisiones pendientes: todas, no solo la del último mes. */}
        {pendientes.length > 0 && (
          <div role="region" aria-labelledby="informes-pendientes-titulo"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid var(--mid)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-xs)", padding: "12px 18px", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <IconAlert width={17} height={17} style={{ color: "var(--mid)", flex: "none" }} aria-hidden="true" />
              <h3 id="informes-pendientes-titulo" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                {puedeRevisar
                  ? `Revisiones pendientes (${pendientes.length})`
                  : `Informes devueltos para corregir (${pendientes.length})`}
              </h3>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {pendientes.map((i) => {
                const sub = calcularResumen(i.cifras, i.separaciones).subtotal;
                return (
                  <li key={i.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <b style={{ color: "var(--text)" }}>{nombrePeriodo(i.periodo)}</b>{" "}
                      <EstadoBadge estado={i.estado} />
                      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
                        {puedeRevisar
                          ? <>Enviado por {i.creado_por ?? "—"} el {fmtFechaHora(i.enviado_at)} · cumplimiento {pct(sub.cumplimiento)} · mora {COP.format(sub.mora)}</>
                          : <>Devuelto por {i.revisado_por ?? "—"}: <i>«{(i.observaciones ?? "").slice(0, 100)}{(i.observaciones ?? "").length > 100 ? "…" : ""}»</i></>}
                      </div>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => abrir(i)}
                      aria-label={`${puedeRevisar ? "Revisar" : "Corregir"} informe de ${nombrePeriodo(i.periodo)}`}>
                      {puedeRevisar ? "Revisar" : "Corregir"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Tarjeta con el último informe registrado. */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-xs)", padding: "14px 18px", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span className="kpi-ico s-brand" aria-hidden="true"><IconChart /></span>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
                {ultimo ? `Último informe · ${nombrePeriodo(ultimo.periodo)}` : "Último informe"}
              </h3>
              {ultimo && <EstadoBadge estado={ultimo.estado} />}
              {subUltimo && subUltimo.cumplimiento !== null && <Cumplimiento valor={subUltimo.cumplimiento} />}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>{detalle}</div>
          </div>
          {accion && (
            <button type="button" className={`btn btn-sm ${accion.primaria && !pendientes.some((i) => i.id === ultimo?.id) ? "btn-primary" : "btn-ghost"}`} onClick={accion.onClick}
              aria-label={ultimo ? `${accion.texto} de ${nombrePeriodo(ultimo.periodo)}` : accion.texto}>
              {accion.texto}
            </button>
          )}
        </div>
        {faltaDelMes && ultimo && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--text-2)" }}>
            <IconAlert width={15} height={15} style={{ color: "var(--warn)", flex: "none" }} aria-hidden="true" />
            <span>Aún no se ha registrado el informe de <b>{nombrePeriodo(periodo)}</b>. Créalo con «Nuevo informe».</span>
          </div>
        )}
        <div aria-live="polite">
          {msg && <div style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}><span aria-hidden="true">✓ </span>{msg}</div>}
          {errorCarga && informes.length > 0 && <div role="alert" style={{ fontSize: 12.5, color: "var(--high)" }}>{errorCarga}</div>}
        </div>
        </div>
      </section>

      {panel && (panel.modo === "historial" || panel.modo === "cuadro" || panel.modo === "nuevo" || actual) && (
        <>
          <div className="drawer-overlay" onClick={cerrar} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="informe-drawer-titulo"
            // Vistas de consulta con tablas anchas: panel amplio para leerlas sin desplazar a los lados.
            // El formulario conserva el ancho estándar (se llena mejor en una columna angosta).
            style={panel.modo === "cuadro" ? { width: "min(1320px, 98vw)" }
              : panel.modo === "historial" || panel.modo === "ver" ? { width: "min(1320px, 98vw)" }
              : undefined}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 id="informe-drawer-titulo" className="drawer-title">{tituloPanel}</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: panel.modo === "historial" || panel.modo === "cuadro" ? 0 : 6 }}>
                  {panel.modo !== "historial" && panel.modo !== "cuadro" && informes.length > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => ir({ modo: "historial" })}>← Todos los informes</button>
                  )}
                  {panel.modo === "editar" && actual && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => ir({ modo: "ver", id: actual.id })}>Ver informe completo</button>
                  )}
                </div>
              </div>
              <button type="button" className="drawer-close" onClick={cerrar} aria-label="Cerrar panel" title="Cerrar (Esc)">×</button>
            </div>
            <div className="drawer-body">
              {panel.modo === "cuadro" ? (
                <CuadroAnual informes={informes} onAbrir={abrir} puedeRevisar={puedeRevisar} />
              ) : panel.modo === "historial" ? (
                <Historial informes={informes} puedeRevisar={puedeRevisar} onAbrir={abrir} />
              ) : panel.modo === "ver" && actual ? (
                <InformeDetalle
                  key={actual.id + actual.updated_at}
                  informe={actual}
                  anterior={informeAnterior(informes, actual.periodo)}
                  puedeRevisar={puedeRevisar}
                  onEditar={() => ir({ modo: "editar", id: actual.id })}
                  onEliminar={() => setPorEliminar(actual)}
                  onRevisar={(a, nota) => revisar(actual, a, nota)}
                  onAbrirAdjunto={() => void verAdjunto(actual.id)}
                  pie={pie}
                />
              ) : (
                <InformeForm
                  key={panel.modo === "editar" ? panel.id : "nuevo"}
                  informe={panel.modo === "editar" ? actual : null}
                  clientes={clientes}
                  periodosUsados={informes.map((x) => x.periodo)}
                  historial={informes}
                  periodoSugerido={periodoSugerido}
                  onGuardar={guardar}
                  onCancelar={cerrar}
                  onAbrirAdjunto={() => { if (actual) void verAdjunto(actual.id); }}
                  onCambio={() => setSucio(true)}
                  pie={pie}
                />
              )}
            </div>
            <div ref={setPie} className="drawer-foot" />
          </aside>
        </>
      )}

      <ConfirmarEliminacion
        abierto={confirmarDescartar}
        titulo="¿Descartar los cambios sin guardar?"
        descripcion="Lo que escribiste desde el último guardado se perderá. Si quieres conservarlo, cancela y usa «Guardar borrador»."
        irreversible={false}
        textoConfirmar="Sí, descartar"
        textoOcupado="Descartando…"
        onCancelar={() => setDescartarHacia(undefined)}
        onConfirmar={() => {
          setSucio(false);
          setPanel(descartarHacia ?? null);
          setDescartarHacia(undefined);
        }}
      />
      <ConfirmarEliminacion
        abierto={!!porEliminar}
        titulo={`¿Eliminar el borrador de ${porEliminar ? nombrePeriodo(porEliminar.periodo) : ""}?`}
        descripcion="Se borran las cifras, el análisis y el adjunto de este borrador. Los informes enviados o aprobados no se pueden eliminar."
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={async () => { if (porEliminar) await eliminar(porEliminar); setPorEliminar(null); }}
      />
    </>
  );
}

/** Lista de todos los informes (uno por mes), dentro del panel lateral. */
export function Historial({ informes, puedeRevisar, onAbrir }: {
  informes: InformeResumen[];
  puedeRevisar: boolean;
  onAbrir: (i: InformeResumen) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>Un informe por mes, del más reciente al más antiguo. Los subtotales e indicadores se calculan con las cifras de cada informe.</span>
      <div className="table-wrap table-scroll">
        <table className="clean" aria-label="Informes mensuales de cartera">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Estado</th>
              <th scope="col" style={{ textAlign: "right" }}>Recaudo real</th>
              <th scope="col">Cumplimiento</th>
              <th scope="col" style={{ textAlign: "right" }}>Mora</th>
              <th scope="col" style={{ textAlign: "right" }}>Ind. cartera</th>
              <th scope="col"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {informes.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>Aún no hay informes registrados.</td></tr>}
            {informes.map((i) => {
              const s = calcularResumen(i.cifras, i.separaciones).subtotal;
              const txt = i.estado === "enviado" && puedeRevisar ? "Revisar" : i.estado === "observado" ? "Corregir" : i.estado === "borrador" ? "Continuar" : "Ver";
              return (
                <tr key={i.id}>
                  <td><b>{nombrePeriodo(i.periodo)}</b><span className="cc-dias">{i.creado_por ?? "—"}</span></td>
                  <td><EstadoBadge estado={i.estado} /></td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(s.real)}</td>
                  <td><Cumplimiento valor={s.cumplimiento} /></td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(s.mora)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{pct(s.indicadorCartera, "—")}</td>
                  <td>
                    <button type="button" className={`btn btn-sm ${txt === "Revisar" || txt === "Corregir" ? "btn-primary" : "btn-ghost"}`}
                      aria-label={`${txt} informe de ${nombrePeriodo(i.periodo)}`} onClick={() => onAbrir(i)}>
                      {txt}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
