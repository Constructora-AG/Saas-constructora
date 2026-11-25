"use client";
// ════════════════════════════════════════════════════════════════════
// Tira de 12 meses «Referencia Smarthome» del cuadro anual (solo quien revisa).
// Cada mes muestra ✓ si el recaudo real de Lotes coincide con Smarthome o la
// diferencia; al pulsarlo se despliega el detalle y la posible causa.
// La tabla completa queda detrás de «Ver tabla detallada».
// ════════════════════════════════════════════════════════════════════
import { useId, useState } from "react";
import { MESES_CORTOS, nombrePeriodo } from "@/lib/cartera/informes";
import type { PistaDiferencia } from "@/lib/cartera/referenciaSmarthome";
import { COP } from "./comun";
import { EstadoComparacion, Pista } from "./ReferenciaSmarthome";

export interface MesTira {
  periodo: string;
  /** Recaudo real del informe (null: sin informe para comparar). */
  informe: number | null;
  /** Recaudo real según Smarthome (null: mes futuro). */
  smarthome: number | null;
  diferencia: number | null;
  separaciones: number | null;
  anticipos: number | null;
  pista: PistaDiferencia | null;
}

/** $5.000.000 → «$5,0M»; $850.000 → «$850K». */
function compacto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(a / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `$${Math.round(a / 1e3).toLocaleString("es-CO")}K`;
  return `$${Math.round(a)}`;
}

export function TiraSmarthome({ meses, verTabla, onVerTabla }: { meses: MesTira[]; verTabla: boolean; onVerTabla: () => void }) {
  const uid = useId();
  const comparables = meses.filter((m) => m.diferencia !== null);
  const coinciden = comparables.filter((m) => Math.abs(m.diferencia as number) < 1).length;
  // Por defecto se abre el primer mes con diferencia; si no hay, ninguno.
  const [abierto, setAbierto] = useState<number | null>(() => {
    const k = meses.findIndex((m) => m.diferencia !== null && Math.abs(m.diferencia) >= 1);
    return k >= 0 ? k : null;
  });
  const m = abierto !== null ? meses[abierto] : null;

  return (
    <section aria-labelledby={`${uid}-t`} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h3 id={`${uid}-t`} className="section-title" style={{ margin: 0 }}>Referencia Smarthome · Lotes Reserva del Manantial</h3>
          <span className="muted" style={{ fontSize: 12 }}>Recaudo real del informe frente a Smarthome (pagos de cuota inicial menos separaciones). Pulsa un mes para ver el detalle.</span>
        </div>
        {comparables.length > 0 && (
          <span className={`badge ${coinciden === comparables.length ? "ok" : "warn"}`}>
            Coincide en {coinciden} de {comparables.length} meses
          </span>
        )}
      </div>

      <div role="group" aria-label="Meses del año" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(78px, 1fr))", gap: 6 }}>
        {meses.map((x, k) => {
          const hay = x.diferencia !== null;
          const igual = hay && Math.abs(x.diferencia as number) < 1;
          const fondo = !hay ? "var(--surface-2)" : igual ? "var(--ok-soft)" : "var(--warn-soft)";
          const tinta = !hay ? "var(--muted)" : igual ? "var(--ok)" : "var(--warn)";
          const texto = !hay ? "—" : igual ? "✓" : `${(x.diferencia as number) > 0 ? "+" : "−"}${compacto(x.diferencia as number)}`;
          const etiqueta = !hay
            ? `${nombrePeriodo(x.periodo)}: sin informe para comparar`
            : igual ? `${nombrePeriodo(x.periodo)}: coincide con Smarthome`
            : `${nombrePeriodo(x.periodo)}: Smarthome registra ${COP.format(Math.abs(x.diferencia as number))} ${(x.diferencia as number) > 0 ? "más" : "menos"}`;
          return (
            <button key={x.periodo} type="button" disabled={!hay && x.smarthome === null}
              aria-pressed={abierto === k} aria-label={etiqueta} title={etiqueta}
              onClick={() => setAbierto((a) => (a === k ? null : k))}
              style={{
                border: abierto === k ? "2px solid var(--brand-500)" : "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                background: fondo, padding: abierto === k ? "5px 4px" : "6px 5px", cursor: !hay && x.smarthome === null ? "default" : "pointer",
                display: "grid", gap: 2, justifyItems: "center", font: "inherit", minHeight: 52,
              }}>
              <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>{MESES_CORTOS[k]}</span>
              <span className="num" style={{ fontSize: igual ? 15 : 12, fontWeight: 700, color: tinta }} aria-hidden="true">
                {!hay || igual ? texto : <><span>! </span>{texto}</>}
              </span>
            </button>
          );
        })}
      </div>

      {m && (
        <div role="region" aria-label={`Detalle de ${nombrePeriodo(m.periodo)}`}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-xs)", padding: "12px 16px", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ color: "var(--text)" }}>{nombrePeriodo(m.periodo)}</b>
            <EstadoComparacion diferencia={m.diferencia} />
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "6px 18px", fontSize: 13 }}>
            {([
              ["Recaudo real · informe", m.informe],
              ["Recaudo real · Smarthome", m.smarthome],
              ["Separaciones · Smarthome", m.separaciones],
              ["Anticipos · Smarthome", m.anticipos],
            ] as [string, number | null][]).map(([t, v]) => (
              <div key={t}>
                <dt className="muted" style={{ fontSize: 11.5 }}>{t}</dt>
                <dd className="num" style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>{v === null ? "—" : COP.format(v)}</dd>
              </div>
            ))}
          </dl>
          {m.pista && <Pista texto={m.pista.texto} sinCausa={m.pista.tipo === "sin_causa"} />}
        </div>
      )}

      <div>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={verTabla} onClick={onVerTabla}>
          {verTabla ? "Ocultar tabla detallada ▴" : "Ver tabla detallada ▾"}
        </button>
      </div>
    </section>
  );
}
