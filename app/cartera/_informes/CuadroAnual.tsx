"use client";
// ════════════════════════════════════════════════════════════════════
// Cuadro anual de recaudo y mora — reemplaza el «Cuadro control de
// indicadores tramitación y cartera» (Excel): 12 meses lado a lado por
// proyecto, con subtotales, acumulados e indicadores calculados a partir
// de los informes mensuales. La misma estructura (bloques) se usa para la
// pantalla y para la descarga en Excel.
// ════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import {
  ESTADOS_INFORME,
  MESES_CORTOS,
  PROYECTOS_INFORME,
  construirCuadroAnual,
  nombrePeriodo,
  variacionAtipica,
  type CuadroAnual as Cuadro,
  type InformeResumen,
  type ResumenProyecto,
} from "@/lib/cartera/informes";
import { downloadBlob } from "@/lib/transporte/export";
import { IconDownload } from "../../icons";
import { COP, pct } from "./comun";
import { GraficasCuadro } from "./GraficasCuadro";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Formato = "cop" | "pct";
interface Fila {
  etiqueta: string;
  valores: (number | null)[];
  /** Columna final (total del año, último valor o indicador del año). */
  final: number | null;
  formato: Formato;
  tipo?: "subtotal" | "acumulado";
  /** Aviso por celda (variación atípica frente al mes anterior). */
  avisos?: (string | null)[];
}
interface Bloque {
  titulo: string;
  nota: string;
  columnaFinal: string;
  filas: Fila[];
}

type CampoProyecto = "real" | "programado" | "mora" | "carteraTotal";

/** Construye los bloques del cuadro (mismo orden que el Excel). */
function bloquesDe(c: Cuadro): Bloque[] {
  const valor = (k: number, proyecto: string | null, campo: CampoProyecto): number | null => {
    const r = c.meses[k].resumen;
    if (!r) return null;
    if (proyecto === null) return r.subtotal[campo];
    return (r.proyectos.find((p) => p.proyecto === proyecto) as ResumenProyecto)[campo];
  };
  const serie = (proyecto: string | null, campo: CampoProyecto) => c.meses.map((_, k) => valor(k, proyecto, campo));
  const suma = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  const ultimoValor = (xs: (number | null)[]) => [...xs].reverse().find((x) => x !== null) ?? null;
  const ratio = (a: (number | null)[], b: (number | null)[]) => a.map((x, k) => (x === null || b[k] === null || !b[k] ? null : x / (b[k] as number)));
  const avisos = (xs: (number | null)[], que: string) =>
    xs.map((x, k) => {
      if (k === 0) return null;
      const prev = [...xs.slice(0, k)].reverse().find((v) => v !== null);
      const v = variacionAtipica(prev, x);
      return v === null ? null : `${que}: ${v > 0 ? "+" : ""}${Math.round(v * 100)} % frente al mes anterior con informe. Verifica la cifra.`;
    });

  const flujo = (titulo: string, nota: string, campo: "real" | "programado", acumulado: (number | null)[]): Bloque => ({
    titulo,
    nota,
    columnaFinal: "Total año",
    filas: [
      ...PROYECTOS_INFORME.map((p) => { const xs = serie(p.id, campo); return { etiqueta: p.nombre, valores: xs, final: suma(xs), formato: "cop" as const }; }),
      { etiqueta: "Subtotal", valores: serie(null, campo), final: suma(serie(null, campo)), formato: "cop", tipo: "subtotal" },
      { etiqueta: "Acumulado", valores: acumulado, final: null, formato: "cop", tipo: "acumulado" },
    ],
  });
  const saldo = (titulo: string, nota: string, campo: "mora" | "carteraTotal", nombre: string): Bloque => ({
    titulo,
    nota,
    columnaFinal: "Último mes",
    filas: [
      ...PROYECTOS_INFORME.map((p) => { const xs = serie(p.id, campo); return { etiqueta: p.nombre, valores: xs, final: ultimoValor(xs), formato: "cop" as const, avisos: avisos(xs, `${nombre} de ${p.nombre}`) }; }),
      { etiqueta: "Subtotal", valores: serie(null, campo), final: ultimoValor(serie(null, campo)), formato: "cop", tipo: "subtotal" },
    ],
  });

  const real = serie(null, "real"), prog = serie(null, "programado");
  const mora = serie(null, "mora"), cartera = serie(null, "carteraTotal");
  return [
    flujo("Recaudo real del mes", "Recaudo pagado menos separaciones.", "real", c.acumuladoReal),
    flujo("Recaudo programado del mes", "Lo que se debía recaudar según el informe.", "programado", c.acumuladoProgramado),
    {
      titulo: "Indicador de recaudo mensual",
      nota: "Recaudo real ÷ recaudo programado. La columna final es el del año (acumulados).",
      columnaFinal: "Año",
      filas: [
        ...PROYECTOS_INFORME.map((p) => {
          const r = serie(p.id, "real"), g = serie(p.id, "programado");
          return { etiqueta: p.nombre, valores: ratio(r, g), final: suma(g) ? suma(r) / suma(g) : null, formato: "pct" as const };
        }),
        { etiqueta: "Total", valores: ratio(real, prog), final: c.cumplimientoAnio, formato: "pct", tipo: "subtotal" },
      ],
    },
    saldo("Cartera total en mora", "Valor vencido sin pagar al cierre de cada mes.", "mora", "Cartera en mora"),
    saldo("Cartera total", "Saldo total por recaudar al cierre de cada mes.", "carteraTotal", "Cartera total"),
    {
      titulo: "Indicador de cartera total mensual",
      nota: "Cartera en mora ÷ cartera total.",
      columnaFinal: "Último mes",
      filas: [{ etiqueta: "Total", valores: ratio(mora, cartera), final: ultimoValor(ratio(mora, cartera)), formato: "pct", tipo: "subtotal" }],
    },
  ];
}

const fmt = (v: number | null, f: Formato) => (v === null ? "—" : f === "pct" ? pct(v, "—") : COP.format(v));

const ETIQUETA_CORTA: Record<string, string> = { borrador: "Borrador", enviado: "Por revisar", observado: "Con observ.", aprobado: "Aprobado" };

export function CuadroAnual({ informes, onAbrir }: { informes: InformeResumen[]; onAbrir: (i: InformeResumen) => void }) {
  const anios = useMemo(() => {
    const set = new Set(informes.map((i) => Number(i.periodo.slice(0, 4))));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [informes]);
  const [anio, setAnio] = useState(() => Number(informes[0]?.periodo.slice(0, 4)) || new Date().getFullYear());
  const [soloAprobados, setSoloAprobados] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cuadro = useMemo(() => construirCuadroAnual(informes, anio, soloAprobados), [informes, anio, soloAprobados]);
  const bloques = useMemo(() => bloquesDe(cuadro), [cuadro]);
  const hayAvisos = bloques.some((b) => b.filas.some((f) => f.avisos?.some(Boolean)));
  const sinAprobar = cuadro.meses.filter((m) => m.informe && m.informe.estado !== "aprobado").length;

  async function exportar() {
    setExportando(true);
    setError(null);
    try {
      const mod = await import("exceljs");
      const ExcelJS = (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Constructora Anaya Giraldo — Cartera";
      const ws = wb.addWorksheet(`Cuadro ${anio}`);
      ws.columns = [{ width: 34 }, ...MESES_CORTOS.map(() => ({ width: 15 })), { width: 17 }];
      ws.addRow([`Cuadro control de recaudo y mora ${anio}${soloAprobados ? " (solo informes aprobados)" : ""}`]).font = { bold: true, size: 13 };
      ws.addRow([`Generado ${new Date().toLocaleString("es-CO")} · ${cuadro.mesesConInforme} mes(es) con informe`]).font = { italic: true, color: { argb: "FF6A7484" } };
      for (const b of bloques) {
        ws.addRow([]);
        ws.addRow([b.titulo.toUpperCase()]).font = { bold: true, color: { argb: "FF123A7A" } };
        const head = ws.addRow(["Proyecto", ...MESES_CORTOS.map((m, k) => {
          const est = cuadro.meses[k].informe?.estado;
          return est && est !== "aprobado" ? `${m} (${ETIQUETA_CORTA[est]})` : m;
        }), b.columnaFinal]);
        head.font = { bold: true };
        head.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3FB" } }; });
        for (const f of b.filas) {
          const row = ws.addRow([f.etiqueta, ...f.valores, f.final]);
          if (f.tipo) row.font = { bold: true };
          row.eachCell((cell, col) => {
            if (col === 1) return;
            cell.numFmt = f.formato === "pct" ? "0.00%" : '"$" #,##0';
            const aviso = f.avisos?.[col - 2];
            if (aviso) cell.note = aviso;
          });
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf as BlobPart], { type: XLSX_MIME }), `Cuadro_recaudo_mora_${anio}.xlsx`, XLSX_MIME);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el Excel");
    } finally {
      setExportando(false);
    }
  }

  const stickyCol = { position: "sticky" as const, left: 0, zIndex: 1, background: "var(--surface)", textAlign: "left" as const, minWidth: 190, boxShadow: "1px 0 0 var(--border)" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field">Año
          <select className="input" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-2)", paddingBottom: 9 }}>
          <input type="checkbox" checked={soloAprobados} onChange={(e) => setSoloAprobados(e.target.checked)} />
          Solo informes aprobados
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void exportar()} disabled={exportando || cuadro.mesesConInforme === 0}>
          <IconDownload width={15} height={15} /> {exportando ? "Generando…" : "Descargar Excel"}
        </button>
      </div>
      {error && <div role="alert" style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}

      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: 0 }}>
        <div className="kpi"><div className="kpi-head"><span className="kpi-label">Recaudo real acumulado</span></div><div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(cuadro.totalReal)}</div><div className="kpi-foot">programado {COP.format(cuadro.totalProgramado)}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-label">Cumplimiento del año</span></div><div className="kpi-value" style={{ fontSize: 19 }}>{pct(cuadro.cumplimientoAnio, "—")}</div><div className="kpi-foot">acumulado real ÷ programado</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-label">Promedio mensual</span></div><div className="kpi-value" style={{ fontSize: 19 }}>{cuadro.promedioReal === null ? "—" : COP.format(cuadro.promedioReal)}</div><div className="kpi-foot">sobre {cuadro.mesesConInforme} mes(es) con informe</div></div>
      </div>

      {cuadro.mesesConInforme === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {soloAprobados ? `No hay informes aprobados de ${anio}.` : `No hay informes registrados de ${anio}.`}
        </p>
      )}
      {sinAprobar > 0 && !soloAprobados && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Incluye {sinAprobar} mes(es) sin aprobar; su estado aparece bajo el nombre del mes. Marca «Solo informes aprobados» para ver solo cifras oficiales.
        </p>
      )}
      {hayAvisos && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-2)" }}>
          <span className="badge warn" style={{ marginRight: 6 }}><span aria-hidden="true">!</span> Revisar</span>
          marca cifras de cartera que cambian más del 50 % frente al mes anterior. Pasa el cursor o enfoca la celda para ver el detalle.
        </p>
      )}

      {cuadro.mesesConInforme > 0 && <GraficasCuadro cuadro={cuadro} />}

      {cuadro.mesesConInforme > 0 && bloques.map((b) => (
        <section key={b.titulo} style={{ display: "grid", gap: 6 }} aria-label={b.titulo}>
          <div>
            <h3 className="section-title" style={{ margin: 0 }}>{b.titulo}</h3>
            <span className="muted" style={{ fontSize: 12 }}>{b.nota}</span>
          </div>
          <div className="table-wrap table-scroll">
            <table className="clean" aria-label={`${b.titulo} ${anio}`} style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...stickyCol, background: "var(--surface-2)" }}>Proyecto</th>
                  {cuadro.meses.map((m, k) => {
                    const inf = m.informe ? informes.find((i) => i.id === m.informe!.id) : undefined;
                    return (
                      <th key={m.mes} scope="col" style={{ textAlign: "right", padding: "8px 12px" }}>
                        {inf ? (
                          <button type="button" onClick={() => onAbrir(inf)} title={`Abrir informe de ${nombrePeriodo(m.periodo)}`}
                            style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--brand)", textDecoration: "underline", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit" }}>
                            {MESES_CORTOS[k]}
                          </button>
                        ) : MESES_CORTOS[k]}
                        {m.informe && m.informe.estado !== "aprobado" && (
                          <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--warn)", textTransform: "none", letterSpacing: 0 }}>
                            {ESTADOS_INFORME[m.informe.estado].label}
                          </span>
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" style={{ textAlign: "right", padding: "8px 12px" }}>{b.columnaFinal}</th>
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f) => (
                  <tr key={f.etiqueta} style={f.tipo ? { background: "var(--surface-2)" } : undefined}>
                    <th scope="row" style={{ ...stickyCol, background: f.tipo ? "var(--surface-2)" : "var(--surface)", padding: "9px 12px", fontWeight: f.tipo ? 700 : 600, color: "var(--text)", borderTop: f.tipo === "subtotal" ? "2px solid var(--border-strong)" : "1px solid var(--border)" }}>
                      {f.etiqueta}
                    </th>
                    {f.valores.map((v, k) => {
                      const aviso = f.avisos?.[k];
                      return (
                        <td key={k} className="num" tabIndex={aviso ? 0 : undefined} title={aviso ?? undefined} aria-label={aviso ? `${fmt(v, f.formato)}. ${aviso}` : undefined}
                          style={{ textAlign: "right", padding: "9px 12px", fontWeight: f.tipo ? 700 : undefined, color: v === null ? "var(--muted)" : undefined, background: aviso ? "var(--warn-soft)" : undefined, borderTop: f.tipo === "subtotal" ? "2px solid var(--border-strong)" : undefined }}>
                          {aviso && <span aria-hidden="true" style={{ color: "var(--warn)", fontWeight: 700, marginRight: 4 }}>!</span>}
                          {fmt(v, f.formato)}
                        </td>
                      );
                    })}
                    <td className="num" style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700, borderTop: f.tipo === "subtotal" ? "2px solid var(--border-strong)" : undefined }}>
                      {f.final === null ? "" : fmt(f.final, f.formato)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
