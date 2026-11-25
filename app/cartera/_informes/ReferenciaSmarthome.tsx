"use client";
// ════════════════════════════════════════════════════════════════════
// Referencia Smarthome en la revisión de un informe (solo quien revisa).
// Tarjeta de estado: ¿coincide el recaudo real de Lotes con Smarthome?,
// posible causa si no coincide, composición del recaudo (cuotas del mes,
// anticipos, mora recuperada) y separaciones del mes. No modifica el informe.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { nombrePeriodo, type InformeResumen } from "@/lib/cartera/informes";
import { separacionEnInforme, type ComparacionSmarthome, type ReferenciaLotes } from "@/lib/cartera/referenciaSmarthome";
import { COP, fmtFechaHora } from "./comun";

interface Respuesta { periodo: string; sincronizado: string | null; lotes: ReferenciaLotes; comparacion: ComparacionSmarthome }

/** Estado principal, con texto e ícono (no solo color). */
export function EstadoComparacion({ diferencia, grande = false }: { diferencia: number | null; grande?: boolean }) {
  const estilo = grande ? { fontSize: 14, padding: "6px 12px" } : undefined;
  if (diferencia === null) return <span className="badge" style={{ ...estilo, background: "var(--surface-2)", color: "var(--muted)" }}>Sin informe para comparar</span>;
  if (Math.abs(diferencia) < 1) return <span className="badge ok" style={estilo}><span aria-hidden="true">✓</span> Coincide con Smarthome</span>;
  return (
    <span className="badge warn" style={estilo}>
      <span aria-hidden="true">!</span> Smarthome registra {COP.format(Math.abs(diferencia))} {diferencia > 0 ? "más" : "menos"} que el informe
    </span>
  );
}

/** Caja con la posible causa de una diferencia. */
export function Pista({ texto, sinCausa }: { texto: string; sinCausa: boolean }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: 13, color: "var(--text-2)" }}>
      <b style={{ color: "var(--text)" }}>{sinCausa ? "Causa" : "Posible causa"}:</b> {texto}
    </div>
  );
}

const PARTES = [
  { key: "delMes", label: "Cuotas del mes", color: "var(--viz-1)" },
  { key: "anticipado", label: "Anticipos de cuotas futuras", color: "var(--viz-2)" },
  { key: "moraRecuperada", label: "Mora recuperada", color: "var(--viz-3)" },
] as const;

/** Barra segmentada (delgada, sin texto) + leyenda con nombre, valor y porcentaje. */
function Composicion({ r }: { r: ReferenciaLotes }) {
  const total = r.delMes + r.anticipado + r.moraRecuperada;
  if (total <= 0) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Smarthome no registra recaudo de cuotas este mes.</p>;
  const partes = PARTES.map((p) => ({ ...p, valor: r[p.key], pct: r[p.key] / total }));
  const resumen = partes.map((p) => `${p.label} ${COP.format(p.valor)} (${Math.round(p.pct * 100)} %)`).join(", ");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div role="img" aria-label={`Composición del recaudo real según Smarthome: ${resumen}`}
        style={{ display: "flex", gap: 2, height: 10, borderRadius: 999, overflow: "hidden", background: "var(--surface)" }}>
        {partes.filter((p) => p.valor > 0).map((p) => <div key={p.key} style={{ flex: `${p.valor} 0 0`, background: p.color }} />)}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13 }} aria-hidden="true">
        {partes.map((p) => (
          <li key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: "none" }} />
            {p.label} <b className="num" style={{ color: "var(--text)" }}>{COP.format(p.valor)}</b>
            <span className="muted">({Math.round(p.pct * 100)} %)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReferenciaSmarthome({ informe }: { informe: InformeResumen }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cartera/informes/referencia?periodo=${informe.periodo.slice(0, 7)}`);
      const body = (await res.json().catch(() => ({}))) as Respuesta & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setDatos(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar Smarthome");
    } finally {
      setCargando(false);
    }
  }, [informe.periodo]);
  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando && !datos) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Consultando los datos de Smarthome…</p>;
  if (error) {
    return (
      <div role="alert" style={{ fontSize: 13, color: "var(--high)" }}>
        No se pudo consultar Smarthome: {error}{" "}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cargar()}>Reintentar</button>
      </div>
    );
  }
  if (!datos) return null;
  const { lotes: r, comparacion: c } = datos;

  const sepInforme = informe.separaciones.filter((s) => s.proyecto === "lotes_manantial");
  const sepInformeTotal = sepInforme.reduce((t, s) => t + s.valor, 0);
  const nombresInforme = sepInforme.map((s) => s.cliente);
  const tarjeta = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-xs)", padding: "16px 18px", display: "grid", gap: 14 } as const;

  return (
    <div style={tarjeta}>
      {/* 1. Resultado */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <EstadoComparacion diferencia={c.diferencia} grande />
          <span className="muted" style={{ fontSize: 12 }}>Lotes Reserva del Manantial · {nombrePeriodo(informe.periodo)}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Recaudo real (sin separaciones): informe <b className="num" style={{ color: "var(--text)" }}>{c.informeReal === null ? "—" : COP.format(c.informeReal)}</b>
          {" · "}Smarthome <b className="num" style={{ color: "var(--text)" }}>{COP.format(r.recaudoReal)}</b>
        </div>
        {c.pista && <Pista texto={c.pista.texto} sinCausa={c.pista.tipo === "sin_causa"} />}
      </div>

      {/* 2. Composición del recaudo */}
      <div style={{ display: "grid", gap: 6 }}>
        <b style={{ fontSize: 13, color: "var(--text)" }}>Cómo se compone el recaudo real según Smarthome</b>
        <Composicion r={r} />
      </div>

      {/* 3. Separaciones */}
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13, color: "var(--text)" }}>Separaciones del mes ({r.separaciones.length}) · <span className="num">{COP.format(r.separacionesTotal)}</span></b>
          {sepInforme.length > 0
            ? (Math.abs(sepInformeTotal - r.separacionesTotal) < 1
              ? <span className="badge ok" style={{ padding: "1px 8px" }}><span aria-hidden="true">✓</span> Igual al informe</span>
              : <span className="badge warn" style={{ padding: "1px 8px" }}><span aria-hidden="true">!</span> El informe lista {COP.format(sepInformeTotal)}</span>)
            : r.separaciones.length > 0 && <span className="muted" style={{ fontSize: 12 }}>El informe no las detalla</span>}
        </div>
        {r.separaciones.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {r.separaciones.map((s) => {
              const enInforme = sepInforme.length > 0 ? separacionEnInforme(s.cliente, nombresInforme) : null;
              return (
                <li key={s.prospect_id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12.5 }}>
                  {enInforme !== null && <span aria-hidden="true" style={{ color: enInforme ? "var(--ok)" : "var(--warn)", fontWeight: 700 }}>{enInforme ? "✓" : "!"}</span>}
                  <span>{s.cliente}{s.unidad && <span className="muted"> · {s.unidad.toLowerCase()}</span>} · <b className="num">{COP.format(s.valor)}</b></span>
                  {enInforme === true && <span className="sr-text">(en el informe)</span>}
                  {enInforme === false && <span style={{ fontSize: 11.5, color: "var(--warn)" }}>no está en el informe</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
        Datos sincronizados el {fmtFechaHora(datos.sincronizado)} · Las separaciones son los pagos a la primera cuota de cada venta.
        Solo se compara Lotes: Aqua no, porque la sincronización no conserva los pagos de ventas desistidas; Cascada Real no está en Smarthome; el programado no, porque el informe lo ajusta por anticipos.
      </p>
    </div>
  );
}
