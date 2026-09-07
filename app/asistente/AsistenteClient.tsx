"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconDownload, IconInfo, IconMessage, IconRefresh } from "../icons";
import { descargarInformePdf } from "@/lib/asistente/informePdf";

interface Paso { proposito: string; sql: string; filas: number; error?: string }
interface Mensaje { role: "user" | "assistant"; content: string; pasos?: Paso[]; at: string }
interface Conv { id: string; titulo: string; updated_at: string }

const SUGERENCIAS: Record<string, string[]> = {
  cartera: [
    "¿Cómo está la cartera hoy? Resume mora por proyecto y los 10 clientes con mayor saldo en mora.",
    "Informe de recaudo del mes actual comparado con el mes anterior, por proyecto.",
  ],
  vendedores: ["¿Cómo va cada asesor este mes: prospectos recibidos, gestiones y ventas?"],
  marketing: [
    "¿Cuántos leads llegaron este mes, cuántos siguen sin gestionar y cómo va cada asesor?",
    "Informe ejecutivo de ventas: unidades y valor vendido por proyecto y por torre o manzana.",
  ],
  aaa: [
    "Estado de las prefacturas a Triple A: cuáles están pendientes de pago y por qué valor.",
    "Resumen de servicios de Transporte AAA del mes: cantidad, valor total y cuánto falta por prefacturar.",
  ],
};
const AREA_NOMBRE: Record<string, string> = { cartera: "cartera, cobranza y recaudo", vendedores: "vendedores", marketing: "marketing, leads y ventas", aaa: "Proyecto Triple A" };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

export function AsistenteClient({ compacto = false }: { compacto?: boolean }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [areas, setAreas] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verPasos, setVerPasos] = useState<number | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const cargarLista = useCallback(async () => {
    const r = await fetch("/api/asistente"); const j = await r.json();
    if (r.ok) { setConvs(j.conversaciones ?? []); setConfigurado(Boolean(j.configurado)); setAreas(j.areas ?? []); }
    else setError(j.error ?? "No se pudo cargar");
  }, []);
  useEffect(() => { void cargarLista(); }, [cargarLista]);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [mensajes, busy]);

  const abrir = async (cid: string) => {
    setError(""); const r = await fetch(`/api/asistente?id=${cid}`); const j = await r.json();
    if (!r.ok) { setError(j.error ?? "No se pudo abrir"); return; }
    setId(cid); setMensajes(j.mensajes ?? []); setVerPasos(null);
  };
  const nueva = () => { setId(null); setMensajes([]); setError(""); setTexto(""); area.current?.focus(); };
  const eliminar = async (cid: string) => {
    if (!confirm("¿Eliminar esta conversación?")) return;
    await fetch(`/api/asistente?id=${cid}`, { method: "DELETE" });
    if (cid === id) nueva();
    void cargarLista();
  };

  const enviar = async (msg?: string) => {
    const m = (msg ?? texto).trim();
    if (!m || busy) return;
    setTexto(""); setError(""); setBusy(true);
    const ahora = new Date().toISOString();
    setMensajes((prev) => [...prev, { role: "user", content: m, at: ahora }]);
    try {
      const r = await fetch("/api/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, mensaje: m }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setId(j.id);
      setMensajes((prev) => [...prev, { role: "assistant", content: j.respuesta, pasos: j.pasos, at: new Date().toISOString() }]);
      void cargarLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMensajes((prev) => prev.slice(0, -1)); setTexto(m);
    } finally { setBusy(false); }
  };

  const copiar = async (s: string) => { try { await navigator.clipboard.writeText(s); } catch { /* sin portapapeles */ } };
  const pdf = async (m: Mensaje, i: number) => {
    const pregunta = [...mensajes].slice(0, i).reverse().find((x) => x.role === "user")?.content ?? "Informe";
    const titulo = (/^#\s+(.+)/m.exec(m.content)?.[1] ?? pregunta).slice(0, 90);
    await descargarInformePdf(titulo, m.content.replace(/^#\s+.+\n?/, ""), [`Solicitud: ${pregunta}`, `Generado por el Asistente de gerencia el ${new Date().toLocaleString("es-CO")}`]);
  };

  return (
    <div className={`asis${compacto ? " compacto" : ""}`}>
      <aside className="asis-side">
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={nueva}><IconMessage /> Nueva conversación</button>
        {compacto && convs.length > 0 && (
          <select className="input select-sm" value={id ?? ""} onChange={(e) => e.target.value && void abrir(e.target.value)}>
            <option value="">Conversaciones anteriores…</option>
            {convs.map((c) => <option key={c.id} value={c.id}>{fechaCorta(c.updated_at)} · {c.titulo}</option>)}
          </select>
        )}
        <div className="asis-list">
          {convs.map((c) => (
            <div key={c.id} className={`asis-conv${c.id === id ? " active" : ""}`} onClick={() => void abrir(c.id)}>
              <div className="asis-conv-t">{c.titulo}</div>
              <div className="asis-conv-m"><span>{fechaCorta(c.updated_at)}</span><button className="asis-x" title="Eliminar" onClick={(e) => { e.stopPropagation(); void eliminar(c.id); }}>×</button></div>
            </div>
          ))}
          {convs.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: "8px 4px" }}>Aún no hay conversaciones.</div>}
        </div>
      </aside>

      <section className="asis-main">
        {!configurado && (
          <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
            <IconInfo /><div><b>El asistente aún no está activo.</b> Gerencia debe cargar la clave de la API en el módulo Configuración IA.</div>
          </div>
        )}
        <div className="asis-chat">
          {mensajes.length === 0 && (
            <div className="asis-empty">
              <div className="asis-empty-t">¿Qué necesitas saber hoy?</div>
              <div className="muted" style={{ marginBottom: 14 }}>Puedo consultar {areas.length ? areas.map((a) => AREA_NOMBRE[a] ?? a).join(", ") : "la información de tus módulos"} y armar informes listos para descargar en PDF.</div>
              <div className="asis-sug">
                {areas.flatMap((a) => SUGERENCIAS[a] ?? []).map((s) => <button key={s} className="asis-chip" onClick={() => void enviar(s)} disabled={busy || !configurado}>{s}</button>)}
              </div>
            </div>
          )}
          {mensajes.map((m, i) => (
            <div key={i} className={`asis-msg ${m.role}`}>
              <div className="asis-bubble">
                {m.role === "user" ? <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div> : <Markdown texto={m.content} />}
                {m.role === "assistant" && (
                  <div className="asis-actions">
                    {m.pasos && m.pasos.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setVerPasos(verPasos === i ? null : i)}>{verPasos === i ? "Ocultar consultas" : `Ver consultas (${m.pasos.length})`}</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => void copiar(m.content)}>Copiar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => void pdf(m, i)}><IconDownload /> Descargar PDF</button>
                  </div>
                )}
                {verPasos === i && m.pasos && (
                  <div className="asis-pasos">
                    {m.pasos.map((p, k) => (
                      <details key={k} open={Boolean(p.error)}>
                        <summary>{k + 1}. {p.proposito || "Consulta"} <span className="muted">· {p.error ? "error" : `${p.filas} filas`}</span></summary>
                        <pre>{p.sql}</pre>
                        {p.error && <div style={{ color: "var(--high)", fontSize: 12 }}>{p.error}</div>}
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="asis-msg assistant"><div className="asis-bubble asis-think"><IconRefresh /> Consultando la información y redactando la respuesta…</div></div>}
          {error && <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}><IconInfo /><div>{error}</div></div>}
          <div ref={fin} />
        </div>
        <div className="asis-input">
          <textarea ref={area} className="input" rows={2} placeholder="Escribe tu pregunta o pide un informe… (Enter para enviar, Shift+Enter para salto de línea)" value={texto}
            onChange={(e) => setTexto(e.target.value)} disabled={busy || !configurado}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
          <button className="btn btn-primary" disabled={busy || !texto.trim() || !configurado} onClick={() => void enviar()}>{busy ? "Pensando…" : "Enviar"}</button>
        </div>
      </section>
    </div>
  );
}

// ── Render mínimo de Markdown (títulos, listas, tablas, código, negrita) ──
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <b key={k++}>{t.slice(2, -2)}</b> : <code key={k++}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
function Markdown({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, "").split("\n"); const nodes: ReactNode[] = []; let i = 0, k = 0;
  while (i < lineas.length) {
    const ln = lineas[i];
    if (/^```/.test(ln)) { i++; const buf: string[] = []; while (i < lineas.length && !/^```/.test(lineas[i])) buf.push(lineas[i++]); i++; nodes.push(<pre key={k++}>{buf.join("\n")}</pre>); continue; }
    if (/^\|/.test(ln)) {
      const filas: string[][] = [];
      while (i < lineas.length && /^\|/.test(lineas[i])) { const c = lineas[i].replace(/^\||\|$/g, "").split("|").map((x) => x.trim()); if (!c.every((x) => /^:?-{2,}:?$/.test(x))) filas.push(c); i++; }
      if (filas.length) nodes.push(
        <div className="table-wrap table-scroll" key={k++}><table className="clean">
          <thead><tr>{filas[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{filas.slice(1).map((f, r) => <tr key={r}>{f.map((c, j) => <td key={j} className={/^[\s$%.,\d-]+$/.test(c) ? "num" : undefined} style={/^[\s$%.,\d-]+$/.test(c) ? { textAlign: "right" } : undefined}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(ln);
    if (h) { const n = h[1].length; nodes.push(n === 1 ? <h2 key={k++}>{inline(h[2])}</h2> : n === 2 ? <h3 key={k++}>{inline(h[2])}</h3> : <h4 key={k++}>{inline(h[2])}</h4>); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(ln)) {
      const items: string[] = []; const ordenada = /^\s*\d/.test(ln);
      while (i < lineas.length && /^\s*([-*•]|\d+[.)])\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      nodes.push(ordenada ? <ol key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol> : <ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>); continue;
    }
    if (/^\s*$/.test(ln)) { i++; continue; }
    if (/^---+$/.test(ln)) { nodes.push(<hr key={k++} />); i++; continue; }
    let p = ln; while (i + 1 < lineas.length && lineas[i + 1].trim() && !/^(#|\||```|\s*([-*•]|\d+[.)])\s)/.test(lineas[i + 1])) p += " " + lineas[++i];
    nodes.push(<p key={k++}>{inline(p)}</p>); i++;
  }
  return <div className="asis-md">{nodes.map((n, j) => <Fragment key={j}>{n}</Fragment>)}</div>;
}
