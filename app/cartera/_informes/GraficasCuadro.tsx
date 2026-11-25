"use client";
// ════════════════════════════════════════════════════════════════════
// Gráficas del cuadro anual de cartera (SVG, sin librerías).
//   1. Recaudo real frente al programado: columna = real; raya = programado.
//   2. Cartera en mora: columna por mes; el indicador de cartera va en el detalle.
// Cada mes es un objetivo de cursor y de teclado (Tab) con el detalle por
// proyecto. Los valores exactos siguen en el cuadro (la «vista de tabla»).
// Colores: tokens de la plataforma (--brand-500 para las marcas, --text para
// la meta); validados: contraste ≥ 3:1 y separación CVD ΔE 30.
// ════════════════════════════════════════════════════════════════════
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { MESES_CORTOS, nombrePeriodo, type CuadroAnual } from "@/lib/cartera/informes";
import { COP, pct } from "./comun";

const ALTO_PLOT = 190;
const MARGEN = { arriba: 22, derecha: 12, abajo: 26, izquierda: 56 };

/** Ancho del contenedor (la gráfica se redibuja al cambiar de tamaño). */
function useAncho<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(600);
  // Se mide antes de pintar para que la gráfica no se salga de la tarjeta en el primer dibujo.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

/** Escala «limpia» para el eje: máximo redondeado y 4 marcas. */
function escala(max: number): { tope: number; marcas: number[] } {
  if (max <= 0) return { tope: 1, marcas: [0] };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? bruto;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, k) => k * paso) };
}

/** $0 · $25M · $1.200M — compacto y en pesos. */
function compacto(v: number): string {
  if (v === 0) return "$0";
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: v % 1e6 === 0 ? 0 : 1 })}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toLocaleString("es-CO", { maximumFractionDigits: 0 })}K`;
  return `$${v}`;
}

interface Detalle { titulo: string; filas: { etiqueta: string; valor: string; fuerte?: boolean; clave?: "columna" | "meta" }[] }

interface Serie {
  /** Altura de la columna por mes (null = sin informe). */
  columna: (number | null)[];
  /** Raya de meta por mes (opcional). */
  meta?: (number | null)[];
  detalle: (k: number) => Detalle | null;
  /** Lectura del último mes con dato (va junto a la leyenda, nunca choca con las columnas). */
  etiquetaFinal: (k: number) => string;
}

function GraficaMensual({ titulo, sub, leyenda, serie, anio }: {
  titulo: string;
  sub: string;
  leyenda: { columna: string; meta?: string };
  serie: Serie;
  anio: number;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const valores = [...serie.columna, ...(serie.meta ?? [])].filter((v): v is number => v !== null);
  const { tope, marcas } = escala(Math.max(0, ...valores));
  const anchoPlot = ancho - MARGEN.izquierda - MARGEN.derecha;
  const banda = anchoPlot / 12;
  const anchoCol = Math.min(24, banda * 0.55);
  const y = (v: number) => MARGEN.arriba + ALTO_PLOT - (v / tope) * ALTO_PLOT;
  const x0 = (k: number) => MARGEN.izquierda + k * banda;
  const alto = MARGEN.arriba + ALTO_PLOT + MARGEN.abajo;
  const ultimo = serie.columna.reduce<number>((u, v, k) => (v !== null ? k : u), -1);
  const det = activo !== null ? serie.detalle(activo) : null;
  const hayDatos = ultimo >= 0;

  // Flechas izquierda/derecha recorren los meses con dato.
  const mover = (e: KeyboardEvent<SVGGElement>, k: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const paso = e.key === "ArrowRight" ? 1 : -1;
    for (let j = k + paso; j >= 0 && j < 12; j += paso) {
      if (serie.columna[j] !== null) {
        (e.currentTarget.parentElement?.querySelector(`[data-mes="${j}"]`) as SVGGElement | null)?.focus();
        return;
      }
    }
  };

  // Posición del cuadro de detalle: junto al mes, sin salirse del contenedor.
  const tipIzq = activo === null ? 0 : Math.min(Math.max(0, x0(activo) + banda / 2 - 110), ancho - 220);

  return (
    <div className="chart-card" style={{ minWidth: 0 }}>
      <div className="chart-title">{titulo}</div>
      <div className="chart-sub" style={{ marginBottom: 10 }}>{sub}</div>
      <div className="chart-legend" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 12, borderRadius: "3px 3px 0 0", background: "var(--brand-500)", display: "inline-block" }} />{leyenda.columna}
        </span>
        {leyenda.meta && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--text)", display: "inline-block" }} />{leyenda.meta}
          </span>
        )}
        {hayDatos && (
          <span style={{ marginLeft: "auto", color: "var(--text-2)" }}>
            Último mes ({MESES_CORTOS[ultimo]}): <b style={{ color: "var(--text)" }}>{serie.etiquetaFinal(ultimo)}</b>
          </span>
        )}
      </div>
      <div ref={ref} style={{ position: "relative" }}>
        {!hayDatos ? (
          <p className="muted" style={{ margin: "24px 0" }}>Sin datos para graficar.</p>
        ) : (
          <svg width={ancho} height={alto} role="group" aria-label={`${titulo} ${anio}. Usa Tab y las flechas para recorrer los meses.`} style={{ display: "block", overflow: "visible" }}>
            {/* Cuadrícula y eje Y: líneas finas, recesivas. */}
            {marcas.map((m) => (
              <g key={m} aria-hidden="true">
                <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(m)} y2={y(m)} stroke={m === 0 ? "var(--border-strong)" : "var(--border)"} strokeWidth={1} />
                <text x={MARGEN.izquierda - 8} y={y(m)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{compacto(m)}</text>
              </g>
            ))}
            {serie.columna.map((v, k) => {
              const cx = x0(k) + banda / 2;
              const meta = serie.meta?.[k] ?? null;
              const d = serie.detalle(k);
              return (
                <g key={k} data-mes={k}
                  tabIndex={v !== null ? 0 : -1}
                  role={v !== null ? "img" : undefined}
                  aria-label={d ? `${d.titulo}: ${d.filas.map((f) => `${f.etiqueta} ${f.valor}`).join(", ")}` : undefined}
                  onPointerEnter={() => v !== null && setActivo(k)}
                  onPointerLeave={() => setActivo((a) => (a === k ? null : a))}
                  onFocus={() => setActivo(k)}
                  onBlur={() => setActivo((a) => (a === k ? null : a))}
                  onKeyDown={(e) => mover(e, k)}
                  style={{ outline: "none", cursor: v !== null ? "default" : undefined }}>
                  {/* Objetivo de cursor: toda la banda del mes, no solo la columna. */}
                  <rect x={x0(k)} y={MARGEN.arriba} width={banda} height={ALTO_PLOT} fill={activo === k ? "var(--brand-soft)" : "transparent"} />
                  {v !== null && v > 0 && (
                    // Columna: extremo redondeado 4px, base recta sobre el eje.
                    <path
                      d={`M${cx - anchoCol / 2},${y(0)} V${y(v) + 4} Q${cx - anchoCol / 2},${y(v)} ${cx - anchoCol / 2 + 4},${y(v)} H${cx + anchoCol / 2 - 4} Q${cx + anchoCol / 2},${y(v)} ${cx + anchoCol / 2},${y(v) + 4} V${y(0)} Z`}
                      fill="var(--brand-500)" opacity={activo === null || activo === k ? 1 : 0.55} />
                  )}
                  {meta !== null && meta > 0 && (
                    <line x1={cx - anchoCol / 2 - 5} x2={cx + anchoCol / 2 + 5} y1={y(meta)} y2={y(meta)} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
                  )}
                  {/* Anillo de foco visible para teclado. */}
                  {activo === k && <rect x={x0(k) + 1} y={MARGEN.arriba} width={banda - 2} height={ALTO_PLOT} fill="none" stroke="var(--brand-500)" strokeWidth={1.5} rx={4} />}
                  <text x={cx} y={y(0) + 16} textAnchor="middle" fontSize={10.5} fill={v !== null ? "var(--text-2)" : "var(--muted)"} aria-hidden="true">{MESES_CORTOS[k]}</text>
                </g>
              );
            })}
          </svg>
        )}
        {det && activo !== null && (
          <div role="presentation"
            style={{ position: "absolute", top: 0, left: tipIzq, width: 220, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)", padding: "8px 10px", fontSize: 12, pointerEvents: "none", zIndex: 2 }}>
            <div style={{ fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>{det.titulo}</div>
            {det.filas.map((f) => (
              <div key={f.etiqueta} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                  {f.clave && <span aria-hidden="true" style={{ width: 10, height: 2, background: f.clave === "columna" ? "var(--brand-500)" : "var(--text)", display: "inline-block", flex: "none" }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.etiqueta}</span>
                </span>
                <span className="num" style={{ fontWeight: f.fuerte ? 700 : 500, color: "var(--text)", whiteSpace: "nowrap" }}>{f.valor}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GraficasCuadro({ cuadro }: { cuadro: CuadroAnual }) {
  const m = cuadro.meses;
  const real = m.map((x) => x.resumen?.subtotal.real ?? null);
  const prog = m.map((x) => x.resumen?.subtotal.programado ?? null);
  const mora = m.map((x) => x.resumen?.subtotal.mora ?? null);
  const corto = (v: number) => compacto(Math.round(v / 1e5) * 1e5);

  return (
    <div className="charts-grid">
      <GraficaMensual
        anio={cuadro.anio}
        titulo="Recaudo real frente al programado"
        sub="Si la columna supera la raya, el mes cumplió la meta. Pasa el cursor o usa Tab para ver el detalle."
        leyenda={{ columna: "Recaudo real", meta: "Programado" }}
        serie={{
          columna: real,
          meta: prog,
          etiquetaFinal: (k) => `${corto(real[k] ?? 0)} · ${pct(m[k].resumen?.subtotal.cumplimiento ?? null, "—")}`,
          detalle: (k) => {
            const r = m[k].resumen;
            if (!r) return null;
            return {
              titulo: nombrePeriodo(m[k].periodo),
              filas: [
                { etiqueta: "Recaudo real", valor: COP.format(r.subtotal.real), fuerte: true, clave: "columna" },
                { etiqueta: "Programado", valor: COP.format(r.subtotal.programado), clave: "meta" },
                { etiqueta: "Cumplimiento", valor: pct(r.subtotal.cumplimiento, "—"), fuerte: true },
                ...r.proyectos.map((p) => ({ etiqueta: p.nombre, valor: COP.format(p.real) })),
              ],
            };
          },
        }}
      />
      <GraficaMensual
        anio={cuadro.anio}
        titulo="Cartera en mora"
        sub="Valor vencido al cierre de cada mes. El detalle muestra el indicador de cartera y la mora por proyecto."
        leyenda={{ columna: "Cartera en mora" }}
        serie={{
          columna: mora,
          etiquetaFinal: (k) => `${corto(mora[k] ?? 0)} · ${pct(m[k].resumen?.subtotal.indicadorCartera ?? null, "—")}`,
          detalle: (k) => {
            const r = m[k].resumen;
            if (!r) return null;
            return {
              titulo: nombrePeriodo(m[k].periodo),
              filas: [
                { etiqueta: "Cartera en mora", valor: COP.format(r.subtotal.mora), fuerte: true, clave: "columna" },
                { etiqueta: "Cartera total", valor: COP.format(r.subtotal.carteraTotal) },
                { etiqueta: "Indicador de cartera", valor: pct(r.subtotal.indicadorCartera, "—"), fuerte: true },
                ...r.proyectos.map((p) => ({ etiqueta: p.nombre, valor: COP.format(p.mora) })),
              ],
            };
          },
        }}
      />
    </div>
  );
}
