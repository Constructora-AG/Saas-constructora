"use client";
// Referencia Smarthome dentro de la revisión de un informe (solo quien revisa).
// Compara el recaudo real y las separaciones de Lotes Reserva del Manantial con
// los datos sincronizados de Smarthome; no modifica el informe.
import { useCallback, useEffect, useState } from "react";
import { nombrePeriodo, type InformeResumen } from "@/lib/cartera/informes";
import { separacionEnInforme, type ReferenciaLotes } from "@/lib/cartera/referenciaSmarthome";
import { COP, fmtFechaHora } from "./comun";

interface Respuesta { periodo: string; sincronizado: string | null; lotes: ReferenciaLotes }

/** Resultado de comparar dos cifras, con texto (no solo color). */
function Resultado({ informe, smarthome }: { informe: number; smarthome: number }) {
  const d = smarthome - informe;
  if (Math.abs(d) < 1) return <span className="badge ok"><span aria-hidden="true">✓</span> Coincide</span>;
  return <span className="badge warn"><span aria-hidden="true">!</span> Smarthome registra {COP.format(Math.abs(d))} {d > 0 ? "más" : "menos"}</span>;
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

  const cifra = informe.cifras.find((c) => c.proyecto === "lotes_manantial");
  const sepInforme = informe.separaciones.filter((s) => s.proyecto === "lotes_manantial");
  const sepInformeTotal = sepInforme.reduce((s, x) => s + x.valor, 0);
  const realInforme = (cifra?.recaudo_pagado ?? 0) - sepInformeTotal;
  const nombresInforme = sepInforme.map((s) => s.cliente);
  const r = datos?.lotes;

  if (cargando && !datos) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Consultando los datos de Smarthome…</p>;
  if (error) {
    return (
      <div role="alert" style={{ fontSize: 13, color: "var(--high)" }}>
        No se pudo consultar Smarthome: {error}{" "}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cargar()}>Reintentar</button>
      </div>
    );
  }
  if (!r) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        Lotes Reserva del Manantial · {nombrePeriodo(informe.periodo)} · datos sincronizados el {fmtFechaHora(datos?.sincronizado)}
        <br />
        Las separaciones son los pagos a la primera cuota de cada venta (ventas nuevas del mes), que no forman parte del recaudo del informe.
      </p>

      {!cifra ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>El informe no tiene cifras de Lotes Reserva del Manantial para comparar.</p>
      ) : (
        <div className="table-wrap table-scroll">
          <table className="clean" aria-label={`Referencia Smarthome de ${nombrePeriodo(informe.periodo)}`}>
            <thead>
              <tr><th scope="col">Concepto</th><th scope="col" style={{ textAlign: "right" }}>Informe</th><th scope="col" style={{ textAlign: "right" }}>Smarthome</th><th scope="col">Resultado</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Recaudo real</b><span className="cc-dias">sin separaciones</span></td>
                <td className="num" style={{ textAlign: "right" }}>{COP.format(realInforme)}</td>
                <td className="num" style={{ textAlign: "right" }}>{COP.format(r.recaudoReal)}</td>
                <td><Resultado informe={realInforme} smarthome={r.recaudoReal} /></td>
              </tr>
              <tr>
                <td><b>Separaciones del mes</b><span className="cc-dias">ventas nuevas</span></td>
                <td className="num" style={{ textAlign: "right" }}>{sepInforme.length ? COP.format(sepInformeTotal) : <span className="muted">No detalladas</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>{COP.format(r.separacionesTotal)}</td>
                <td>{sepInforme.length ? <Resultado informe={sepInformeTotal} smarthome={r.separacionesTotal} /> : <span className="muted" style={{ fontSize: 12.5 }}>El informe no lista separaciones</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {r.recaudoReal > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
          Del recaudo real en Smarthome: <b>{COP.format(r.delMes)}</b> de cuotas del mes · <b>{COP.format(r.anticipado)}</b> anticipos de cuotas futuras · <b>{COP.format(r.moraRecuperada)}</b> de mora recuperada.
        </p>
      )}

      {r.separaciones.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <b style={{ fontSize: 13 }}>Separaciones registradas en Smarthome ({r.separaciones.length})</b>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3, fontSize: 13 }}>
            {r.separaciones.map((s) => (
              <li key={s.prospect_id}>
                {s.cliente}{s.unidad && <span className="muted"> · {s.unidad.toLowerCase()}</span>} · <span className="num">{COP.format(s.valor)}</span>
                {sepInforme.length > 0 && (separacionEnInforme(s.cliente, nombresInforme)
                  ? <span className="badge ok" style={{ marginLeft: 6, padding: "1px 7px" }}><span aria-hidden="true">✓</span> En el informe</span>
                  : <span className="badge warn" style={{ marginLeft: 6, padding: "1px 7px" }}><span aria-hidden="true">!</span> No está en el informe</span>)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Solo se compara Lotes: Aqua no, porque la sincronización no conserva los pagos de ventas desistidas, y Cascada Real no está en Smarthome.
        El programado tampoco, porque el informe lo ajusta por pagos anticipados.
      </p>
    </div>
  );
}
