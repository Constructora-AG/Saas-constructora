"use client";
// Formulario por secciones del informe mensual de cartera (crear / editar).
// Mismo orden que el informe de gestión: periodo → cifras por proyecto →
// separaciones → clientes en mora → análisis → adjunto.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { IconAlert } from "../../icons";
import { InputMonto, montoDigitado } from "@/app/components/InputMonto";
import {
  MESES_CORTOS,
  NOMBRE_PROYECTO,
  PROYECTOS_INFORME,
  calcularResumen,
  informeAnterior,
  faltantesParaEnviar,
  nombrePeriodo,
  periodoDesdeMes,
  type AdjuntoInforme,
  type CifraProyecto,
  type InformeResumen,
  type MoraDestacada,
  type ProyectoInforme,
  type SeparacionInforme,
} from "@/lib/cartera/informes";
import { COP, MAX_ADJUNTO_BYTES, ResumenTabla, abrirAdjunto, leerArchivo } from "./comun";

export interface ClienteCartera {
  prospect_id: string;
  cliente: string;
  project_name: string;
  monto_en_mora: number;
}

type CampoCifra = "recaudo_pagado" | "recaudo_programado" | "mora" | "cartera_total";
const CAMPOS: { key: CampoCifra; label: string; ayuda: string }[] = [
  { key: "recaudo_programado", label: "Recaudo programado", ayuda: "Lo que se debía recaudar en el mes" },
  { key: "recaudo_pagado", label: "Recaudo pagado", ayuda: "Todo lo recibido, incluidas separaciones" },
  { key: "mora", label: "Cartera en mora", ayuda: "Valor vencido sin pagar al cierre" },
  { key: "cartera_total", label: "Cartera total", ayuda: "Saldo total por recaudar al cierre" },
];

type CifraForm = Record<CampoCifra, string> & { sinMovimiento: boolean };
interface SepForm { proyecto: ProyectoInforme; cliente: string; lote: string; manzana: string; valor: string }
interface MoraForm { proyecto: ProyectoInforme; cliente: string; prospect_id: string | null; detalle: string; valor: string }

const CIFRA0: CifraForm = { recaudo_pagado: "", recaudo_programado: "", mora: "", cartera_total: "", sinMovimiento: false };
const PROY0: ProyectoInforme = "lotes_manantial";

/** Mes anterior al actual en formato YYYY-MM (el informe suele ser del mes cerrado). */
function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const aTexto = (n: number) => (n ? String(n) : "0");

/** ["A", "B", "C"] → "A, B y C". */
const listaNatural = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export interface GuardarInforme {
  periodo: string;
  cifras: CifraProyecto[];
  separaciones: SeparacionInforme[];
  mora_destacada: MoraDestacada[];
  analisis: string;
  recomendaciones: string;
  /** undefined = sin cambios; null = quitar. */
  adjunto?: AdjuntoInforme | null;
}

export function InformeForm({
  informe,
  clientes,
  periodosUsados,
  historial,
  periodoSugerido,
  onGuardar,
  onCancelar,
  onAbrirAdjunto,
  onCambio,
  pie,
}: {
  informe: InformeResumen | null;
  clientes: ClienteCartera[];
  /** Meses que ya tienen informe (YYYY-MM-01), para avisar antes de guardar. */
  periodosUsados: string[];
  /** Informes registrados: se compara cada cifra con el informe anterior. */
  historial: Pick<InformeResumen, "id" | "periodo" | "cifras">[];
  /** Mes propuesto para un informe nuevo (YYYY-MM); por defecto, el mes anterior. */
  periodoSugerido?: string;
  onGuardar: (datos: GuardarInforme, enviar: boolean) => Promise<string | null>;
  onCancelar: () => void;
  onAbrirAdjunto: () => void;
  onCambio: () => void;
  /** Pie fijo del panel donde van los botones (si no hay, quedan al final del formulario). */
  pie?: HTMLElement | null;
}) {
  const uid = useId();
  const [periodo, setPeriodo] = useState(informe ? informe.periodo.slice(0, 7) : periodoSugerido ?? mesAnterior());
  const [cifras, setCifras] = useState<Record<ProyectoInforme, CifraForm>>(() => {
    const base = {} as Record<ProyectoInforme, CifraForm>;
    for (const p of PROYECTOS_INFORME) {
      const c = informe?.cifras.find((x) => x.proyecto === p.id);
      const ceros = c && !c.recaudo_pagado && !c.recaudo_programado && !c.mora && !c.cartera_total;
      base[p.id] = c
        ? ceros
          ? { ...CIFRA0, sinMovimiento: true }
          : { recaudo_pagado: aTexto(c.recaudo_pagado), recaudo_programado: aTexto(c.recaudo_programado), mora: aTexto(c.mora), cartera_total: aTexto(c.cartera_total), sinMovimiento: false }
        : { ...CIFRA0 };
    }
    return base;
  });
  // Explicaciones de cartera de informes anteriores (ya no se piden): se conservan al guardar.
  const [justif] = useState<Record<ProyectoInforme, string>>(() => {
    const base = {} as Record<ProyectoInforme, string>;
    for (const p of PROYECTOS_INFORME) base[p.id] = informe?.cifras.find((x) => x.proyecto === p.id)?.justificacion_cartera ?? "";
    return base;
  });
  const [seps, setSeps] = useState<SepForm[]>(() => (informe?.separaciones ?? []).map((s) => ({ ...s, valor: String(s.valor) })));
  const [moras, setMoras] = useState<MoraForm[]>(() => (informe?.mora_destacada ?? []).map((m) => ({ ...m, valor: String(m.valor) })));
  const [analisis, setAnalisis] = useState(informe?.analisis ?? "");
  const [recomendaciones, setRecomendaciones] = useState(informe?.recomendaciones ?? "");
  const [adjunto, setAdjunto] = useState<AdjuntoInforme | null | undefined>(undefined);
  const [guardando, setGuardando] = useState<"borrador" | "enviar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);

  const marcar = () => { onCambio(); setError(null); setFaltan([]); };

  const setCifra = (p: ProyectoInforme, patch: Partial<CifraForm>) => {
    marcar();
    setCifras((c) => ({ ...c, [p]: { ...c[p], ...patch } }));
  };

  // ── Conversión a datos ──
  const datos = useMemo(() => {
    const errores: string[] = [];
    const num = (v: string, campo: string): number => {
      if (!v.trim()) return 0;
      const n = montoDigitado(v);
      if (n === null || n < 0) { errores.push(`${campo}: valor inválido`); return 0; }
      return n;
    };
    const cs: CifraProyecto[] = [];
    for (const p of PROYECTOS_INFORME) {
      const c = cifras[p.id];
      const algunValor = CAMPOS.some((f) => c[f.key].trim() !== "");
      const justificacion_cartera = justif[p.id].trim() || null;
      if (c.sinMovimiento) cs.push({ proyecto: p.id, recaudo_pagado: 0, recaudo_programado: 0, mora: 0, cartera_total: 0, justificacion_cartera });
      else if (algunValor) {
        cs.push({
          proyecto: p.id,
          recaudo_pagado: num(c.recaudo_pagado, `${p.nombre} · recaudo pagado`),
          recaudo_programado: num(c.recaudo_programado, `${p.nombre} · recaudo programado`),
          mora: num(c.mora, `${p.nombre} · cartera en mora`),
          cartera_total: num(c.cartera_total, `${p.nombre} · cartera total`),
          justificacion_cartera,
        });
      }
    }
    const ss: SeparacionInforme[] = seps.map((s, i) => ({ proyecto: s.proyecto, cliente: s.cliente.trim(), lote: s.lote.trim(), manzana: s.manzana.trim(), valor: num(s.valor, `Separación ${i + 1}`) }));
    const ms: MoraDestacada[] = moras.map((m, i) => ({ proyecto: m.proyecto, cliente: m.cliente.trim(), prospect_id: m.prospect_id, detalle: m.detalle.trim(), valor: num(m.valor, `Cliente en mora ${i + 1}`) }));
    return { cifras: cs, separaciones: ss, mora_destacada: ms, errores };
  }, [cifras, justif, seps, moras]);

  const resumen = useMemo(() => calcularResumen(datos.cifras, datos.separaciones), [datos]);
  const pendientes = useMemo(
    () => PROYECTOS_INFORME.filter((p) => !datos.cifras.some((c) => c.proyecto === p.id)).map((p) => p.id),
    [datos],
  );

  // Al aparecer un error, se lleva el foco al mensaje (visible junto a los botones).
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error, faltan]);
  const periodoISO = periodoDesdeMes(periodo);
  // Informe anterior más reciente (sin contar este) para comparar cada cifra.
  const anterior = useMemo(
    () => (periodoISO ? informeAnterior(historial.filter((x) => x.id !== informe?.id), periodoISO) : null),
    [historial, informe?.id, periodoISO],
  );
  const mesAnt = anterior ? MESES_CORTOS[Number(anterior.periodo.slice(5, 7)) - 1] : "";
  const periodoRepetido = periodoISO !== null && periodoISO !== informe?.periodo && periodosUsados.includes(periodoISO);
  const totalSeps = datos.separaciones.reduce((s, x) => s + x.valor, 0);

  async function guardar(enviar: boolean) {
    setError(null);
    setFaltan([]);
    if (!periodoISO) { setError("Elige el mes del informe."); return; }
    if (periodoRepetido) { setError(`Ya existe un informe de ${nombrePeriodo(periodoISO)}. Ábrelo desde la lista.`); return; }
    if (datos.errores.length) { setError("Revisa los valores marcados."); setFaltan(datos.errores); return; }
    if (datos.separaciones.some((s) => !s.cliente)) { setError("Cada separación necesita el nombre del cliente."); return; }
    if (datos.mora_destacada.some((m) => !m.cliente)) { setError("Cada cliente en mora necesita el nombre."); return; }
    if (enviar) {
      const f = faltantesParaEnviar({ cifras: datos.cifras, separaciones: datos.separaciones, analisis });
      if (f.length) { setError("Falta información para enviar a revisión. Puedes guardarlo como borrador mientras tanto."); setFaltan(f); return; }
    }
    setGuardando(enviar ? "enviar" : "borrador");
    const err = await onGuardar({
      periodo,
      cifras: datos.cifras,
      separaciones: datos.separaciones,
      mora_destacada: datos.mora_destacada,
      analisis,
      recomendaciones,
      ...(adjunto !== undefined ? { adjunto } : {}),
    }, enviar);
    setGuardando(null);
    if (err) setError(err);
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void guardar(false); };

  const nombreAdjunto = adjunto === undefined ? informe?.adjunto_nombre ?? null : adjunto?.name ?? null;
  const elegirCliente = (i: number, texto: string) => {
    marcar();
    const c = clientes.find((x) => `${x.cliente} · ${x.project_name}` === texto);
    setMoras((arr) => arr.map((m, j) => {
      if (j !== i) return m;
      if (!c) return { ...m, cliente: texto, prospect_id: null };
      return { ...m, cliente: c.cliente, prospect_id: c.prospect_id, valor: m.valor || (c.monto_en_mora ? String(c.monto_en_mora) : "") };
    }));
  };

  const fila = { display: "grid", gap: 8, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 } as const;

  return (
    <form id={`${uid}-form`} onSubmit={submit} style={{ display: "grid", gap: 18 }} noValidate>
      {informe?.estado === "observado" && informe.observaciones && (
        <div className="info-bar" role="note" style={{ background: "var(--warn-soft)", color: "var(--text)" }}>
          <span aria-hidden="true" style={{ fontWeight: 700, color: "var(--warn)" }}>!</span>
          <div><b>Observaciones de la revisión:</b> <span style={{ whiteSpace: "pre-wrap" }}>{informe.observaciones}</span></div>
        </div>
      )}

      {/* 1. Periodo */}
      <section aria-labelledby={`${uid}-s1`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-s1`} className="section-title" style={{ margin: 0 }}>1. Mes del informe</h3>
        <label className="field" style={{ maxWidth: 260 }}>Mes informado *
          <input className="input" type="month" required value={periodo} aria-invalid={periodoRepetido || !periodoISO}
            onChange={(e) => { marcar(); setPeriodo(e.target.value); }} />
        </label>
        {periodoRepetido && <span role="alert" style={{ color: "var(--high)", fontSize: 12.5 }}>Ya hay un informe de {nombrePeriodo(periodoISO!)}. Ábrelo desde la lista para editarlo.</span>}
      </section>

      {/* 2. Cifras */}
      <section aria-labelledby={`${uid}-s2`} style={{ display: "grid", gap: 10 }}>
        <h3 id={`${uid}-s2`} className="section-title" style={{ margin: 0 }}>2. Cifras por proyecto</h3>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Escribe los valores en pesos. Si un proyecto no tuvo movimiento en el mes, marca «Sin movimiento».
          {anterior && <> Bajo cada campo aparece el valor de {nombrePeriodo(anterior.periodo)} como referencia.</>}
        </p>
        {PROYECTOS_INFORME.map((p) => {
          const c = cifras[p.id];
          const incluido = c.sinMovimiento || CAMPOS.some((f) => c[f.key].trim() !== "");
          const previo = anterior?.cifras.find((x) => x.proyecto === p.id);
          return (
            <fieldset key={p.id} style={{ ...fila, margin: 0 }}>
              <legend style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", padding: "0 4px" }}>
                {p.nombre} {!incluido && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· pendiente</span>}
              </legend>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-2)" }}>
                <input type="checkbox" checked={c.sinMovimiento} onChange={(e) => setCifra(p.id, { sinMovimiento: e.target.checked })} />
                Sin movimiento este mes (todo en $0)
              </label>
              {!c.sinMovimiento && (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  {CAMPOS.map((f) => {
                    const id = `${uid}-${p.id}-${f.key}`;
                    const invalido = c[f.key].trim() !== "" && (montoDigitado(c[f.key]) ?? -1) < 0;
                    return (
                      <label key={f.key} className="field" htmlFor={id}>
                        <span>{f.label}</span>
                        <InputMonto id={id} className="input num" placeholder="$ 0"
                          value={c[f.key]} aria-invalid={invalido} aria-describedby={`${id}-ayuda`} title={f.ayuda}
                          onChange={(v) => setCifra(p.id, { [f.key]: v } as Partial<CifraForm>)} />
                        {/* Siempre una línea: el valor del informe anterior o, sin él, la ayuda del campo. */}
                        <span id={`${id}-ayuda`} style={{ fontSize: 11, fontWeight: 400 }}>
                          {previo ? <>{mesAnt}: <span className="num">{COP.format(previo[f.key])}</span></> : f.ayuda}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}
      </section>

      {/* 3. Separaciones */}
      <section aria-labelledby={`${uid}-s3`} style={{ display: "grid", gap: 10 }}>
        <h3 id={`${uid}-s3`} className="section-title" style={{ margin: 0 }}>3. Separaciones eliminadas del proyectado</h3>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Se restan del recaudo pagado del proyecto para obtener el recaudo real (cuota inicial sin separaciones).
        </p>
        {seps.map((s, i) => (
          <div key={i} style={{ ...fila, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", alignItems: "end" }} role="group" aria-label={`Separación ${i + 1}`}>
            <label className="field">Proyecto
              <select className="input" value={s.proyecto} onChange={(e) => { marcar(); setSeps((a) => a.map((x, j) => (j === i ? { ...x, proyecto: e.target.value as ProyectoInforme } : x))); }}>
                {PROYECTOS_INFORME.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>Cliente *
              <input className="input" value={s.cliente} required onChange={(e) => { marcar(); setSeps((a) => a.map((x, j) => (j === i ? { ...x, cliente: e.target.value } : x))); }} />
            </label>
            <label className="field">Lote
              <input className="input" value={s.lote} onChange={(e) => { marcar(); setSeps((a) => a.map((x, j) => (j === i ? { ...x, lote: e.target.value } : x))); }} />
            </label>
            <label className="field">Manzana
              <input className="input" value={s.manzana} onChange={(e) => { marcar(); setSeps((a) => a.map((x, j) => (j === i ? { ...x, manzana: e.target.value } : x))); }} />
            </label>
            <label className="field">Valor
              <InputMonto className="input num" placeholder="$ 0" value={s.valor} onChange={(v) => { marcar(); setSeps((a) => a.map((x, j) => (j === i ? { ...x, valor: v } : x))); }} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar separación ${i + 1}`} onClick={() => { marcar(); setSeps((a) => a.filter((_, j) => j !== i)); }}>Quitar</button>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { marcar(); setSeps((a) => [...a, { proyecto: PROY0, cliente: "", lote: "", manzana: "", valor: "" }]); }}>+ Agregar separación</button>
          {seps.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Total separaciones <b className="num">{COP.format(totalSeps)}</b></span>}
        </div>
      </section>

      {/* 4. Clientes en mora */}
      <section aria-labelledby={`${uid}-s4`} style={{ display: "grid", gap: 10 }}>
        <h3 id={`${uid}-s4`} className="section-title" style={{ margin: 0 }}>4. Clientes en mora destacados</h3>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Busca el cliente en la lista de cartera para vincularlo con su ficha; si no aparece, escribe el nombre.
        </p>
        <datalist id={`${uid}-clientes`}>
          {clientes.map((c) => <option key={c.prospect_id} value={`${c.cliente} · ${c.project_name}`} />)}
        </datalist>
        {moras.map((m, i) => (
          <div key={i} style={{ ...fila, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }} role="group" aria-label={`Cliente en mora ${i + 1}`}>
            <label className="field" style={{ gridColumn: "span 2" }}>Cliente *
              <input className="input" list={`${uid}-clientes`} value={m.cliente} required onChange={(e) => elegirCliente(i, e.target.value)} />
              <span style={{ fontSize: 11, fontWeight: 400 }}>{m.prospect_id ? "✓ Vinculado a la cartera" : "Sin vincular"}</span>
            </label>
            <label className="field">Proyecto
              <select className="input" value={m.proyecto} onChange={(e) => { marcar(); setMoras((a) => a.map((x, j) => (j === i ? { ...x, proyecto: e.target.value as ProyectoInforme } : x))); }}>
                {PROYECTOS_INFORME.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>Detalle
              <input className="input" placeholder="Ej. Lote 12 y 13, Manzana 4 · mora de octubre" value={m.detalle} onChange={(e) => { marcar(); setMoras((a) => a.map((x, j) => (j === i ? { ...x, detalle: e.target.value } : x))); }} />
            </label>
            <label className="field">Valor en mora
              <InputMonto className="input num" placeholder="$ 0" value={m.valor} onChange={(v) => { marcar(); setMoras((a) => a.map((x, j) => (j === i ? { ...x, valor: v } : x))); }} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar cliente en mora ${i + 1}`} onClick={() => { marcar(); setMoras((a) => a.filter((_, j) => j !== i)); }}>Quitar</button>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { marcar(); setMoras((a) => [...a, { proyecto: PROY0, cliente: "", prospect_id: null, detalle: "", valor: "" }]); }}>+ Agregar cliente en mora</button>
        </div>
      </section>

      {/* 5. Análisis */}
      <section aria-labelledby={`${uid}-s5`} style={{ display: "grid", gap: 10 }}>
        <h3 id={`${uid}-s5`} className="section-title" style={{ margin: 0 }}>5. Análisis y recomendaciones</h3>
        <label className="field">Análisis del mes <span style={{ fontWeight: 400 }}>(opcional si adjuntas la presentación)</span>
          <textarea className="input" rows={5} value={analisis} placeholder="Por qué subió o bajó el programado, desistimientos, pagos anticipados, gestiones realizadas…"
            onChange={(e) => { marcar(); setAnalisis(e.target.value); }} style={{ resize: "vertical", fontFamily: "inherit" }} />
        </label>
        <label className="field">Propuestas y recomendaciones
          <textarea className="input" rows={4} value={recomendaciones} placeholder="Acciones propuestas para el próximo mes, inquietudes de los clientes…"
            onChange={(e) => { marcar(); setRecomendaciones(e.target.value); }} style={{ resize: "vertical", fontFamily: "inherit" }} />
        </label>
      </section>

      {/* 6. Adjunto */}
      <section aria-labelledby={`${uid}-s6`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-s6`} className="section-title" style={{ margin: 0 }}>6. Presentación o soporte (opcional)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {nombreAdjunto ? (
            <>
              <button type="button" className="badge ok" style={{ border: "none", cursor: "pointer", font: "inherit" }} title="Abrir adjunto"
                onClick={() => { if (adjunto) abrirAdjunto(adjunto); else onAbrirAdjunto(); }}>
                ✓ {nombreAdjunto}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { marcar(); setAdjunto(null); }}>Quitar</button>
            </>
          ) : (
            <input type="file" accept="application/pdf,image/*,.pptx,.xlsx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Adjuntar presentación o soporte"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > MAX_ADJUNTO_BYTES) { setError("El archivo supera 4 MB. Expórtalo en PDF o comprime las imágenes."); e.target.value = ""; return; }
                marcar();
                try { setAdjunto(await leerArchivo(f)); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo leer el archivo"); }
              }} />
          )}
          <span className="muted" style={{ fontSize: 11.5 }}>PDF, imagen, PowerPoint o Excel · máximo 4 MB.</span>
        </div>
      </section>

      {/* Resumen calculado */}
      <section aria-labelledby={`${uid}-s7`} style={{ display: "grid", gap: 8 }}>
        <h3 id={`${uid}-s7`} className="section-title" style={{ margin: 0 }}>Resumen calculado</h3>
        {pendientes.length > 0 && (
          <div className="info-bar" role="note" style={{ background: "var(--warn-soft)", color: "var(--text)", margin: 0 }}>
            <IconAlert />
            <div>
              <b>Totales parciales.</b> Faltan las cifras de {listaNatural(pendientes.map((p) => NOMBRE_PROYECTO[p]))}; el subtotal y los indicadores
              aún no {pendientes.length === 1 ? "incluyen ese proyecto" : "incluyen esos proyectos"}. Si no tuvo movimiento, marca «Sin movimiento este mes».
            </div>
          </div>
        )}
        <ResumenTabla resumen={resumen} caption="Resumen calculado del informe" pendientes={pendientes} />
      </section>

      {/* Acciones en el pie fijo del panel; el mensaje de error va junto a los botones para que siempre se vea. */}
      {(() => { const acciones = (
      <div style={{ display: "grid", gap: 10 }}>
        {error && (
          <div ref={errorRef} tabIndex={-1} role="alert"
            style={{ color: "var(--high)", background: "var(--high-soft)", border: "1px solid var(--high)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13, maxHeight: 180, overflowY: "auto" }}>
            <b><span aria-hidden="true">! </span>{error}</b>
            {faltan.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{faltan.map((f) => <li key={f}>{f}</li>)}</ul>}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={guardando !== null}>Cancelar</button>
          <button type="submit" form={`${uid}-form`} className="btn btn-ghost" disabled={guardando !== null}>{guardando === "borrador" ? "Guardando…" : "Guardar borrador"}</button>
          <button type="button" className="btn btn-primary" disabled={guardando !== null} onClick={() => void guardar(true)}>
            {guardando === "enviar" ? "Enviando…" : "Guardar y enviar a revisión"}
          </button>
        </div>
      </div>
      ); return pie ? createPortal(acciones, pie) : acciones; })()}
    </form>
  );
}
