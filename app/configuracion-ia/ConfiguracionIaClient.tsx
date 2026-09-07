"use client";
import { useEffect, useState } from "react";
import { IconCheck, IconInfo, IconKey, IconRefresh } from "../icons";

interface Prov { label: string; base_url: string; modelo: string; ayuda: string }
interface Cfg { proveedor: string; base_url: string; modelo: string; api_key: string; tiene_clave: boolean; guardada_en: string | null; guardada_por: string | null; proveedores: Record<string, Prov> }

export function ConfiguracionIaClient() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [f, setF] = useState({ proveedor: "deepseek", base_url: "", modelo: "", api_key: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState<"" | "probar" | "guardar">("");
  const [error, setError] = useState("");

  const cargar = async () => {
    const r = await fetch("/api/asistente/config"); const j = await r.json();
    if (!r.ok) { setError(j.error ?? "No se pudo cargar"); return; }
    setCfg(j); setF({ proveedor: j.proveedor, base_url: j.base_url, modelo: j.modelo, api_key: "" });
  };
  useEffect(() => { void cargar(); }, []);

  const cambiarProveedor = (p: string) => {
    const d = cfg?.proveedores[p];
    setF((v) => ({ ...v, proveedor: p, base_url: d?.base_url ?? "", modelo: d?.modelo ?? "" }));
  };
  const enviar = async (probar: boolean) => {
    setBusy(probar ? "probar" : "guardar"); setMsg(null);
    const r = await fetch(`/api/asistente/config${probar ? "?probar=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json(); setBusy("");
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Error" }); return; }
    if (probar) setMsg({ ok: j.ok, texto: j.ok ? `Conexión correcta. ${j.detalle}` : `No conecta: ${j.detalle}` });
    else { setMsg({ ok: true, texto: "Configuración guardada. El asistente ya usa esta clave." }); void cargar(); }
  };

  if (error) return <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}><IconInfo /><div>{error}</div></div>;
  if (!cfg) return <div className="muted">Cargando…</div>;
  const prov = cfg.proveedores[f.proveedor];

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="info-bar"><IconInfo /><div>
        Estado actual: {cfg.tiene_clave ? <><b>configurado</b> con {cfg.proveedores[cfg.proveedor]?.label ?? cfg.proveedor} · modelo <b>{cfg.modelo}</b> · clave <code>{cfg.api_key}</code>{cfg.guardada_en ? ` · guardada el ${new Date(cfg.guardada_en).toLocaleString("es-CO")} por ${cfg.guardada_por ?? ""}` : " (desde variables del servidor)"}</> : <b>sin clave: el asistente está inactivo</b>}.
      </div></div>

      <div className="chart-card">
        <div className="chart-title">Proveedor de IA</div>
        <div className="chart-sub">Todos los proveedores compatibles con el formato de OpenAI funcionan. Recomendado: DeepSeek por costo.</div>
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <label className="field">Proveedor
            <select className="input" value={f.proveedor} onChange={(e) => cambiarProveedor(e.target.value)}>
              {Object.entries(cfg.proveedores).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
            {prov && <span className="muted" style={{ fontSize: 12.5 }}>{prov.ayuda}</span>}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label className="field">URL base de la API<input className="input" value={f.base_url} onChange={(e) => setF({ ...f, base_url: e.target.value })} placeholder="https://api.deepseek.com" /></label>
            <label className="field">Modelo<input className="input" value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} placeholder="deepseek-chat" /></label>
          </div>
          <label className="field">Clave de la API {cfg.tiene_clave && <span className="muted" style={{ fontWeight: 400 }}>(déjala vacía para conservar la actual {cfg.api_key})</span>}
            <input className="input" type="password" autoComplete="new-password" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} placeholder="sk-…" />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" disabled={!!busy || (!f.api_key && !cfg.tiene_clave)} onClick={() => void enviar(true)}><IconRefresh /> {busy === "probar" ? "Probando…" : "Probar conexión"}</button>
            <button className="btn btn-primary" disabled={!!busy || (!f.api_key && !cfg.tiene_clave)} onClick={() => void enviar(false)}><IconKey /> {busy === "guardar" ? "Guardando…" : "Guardar"}</button>
          </div>
          {msg && <div className="info-bar" style={msg.ok ? undefined : { background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>{msg.ok ? <IconCheck /> : <IconInfo />}<div>{msg.texto}</div></div>}
        </div>
      </div>

      <div className="chart-card" style={{ marginTop: 16 }}>
        <div className="chart-title">Quién ve qué en el asistente</div>
        <div className="chart-sub">La burbuja de chat está disponible para todos los usuarios. Cada uno solo puede consultar la información de sus módulos: el servidor bloquea cualquier consulta fuera de su alcance.</div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
          <li><b>Super admin (Gerencia):</b> toda la información.</li>
          <li><b>Operación:</b> cartera, cobranza, recaudo y vendedores.</li>
          <li><b>Comercial:</b> marketing, leads y ventas.</li>
          <li><b>Finanzas:</b> Proyecto Triple A (Transporte, Alquiler y Prefacturas).</li>
          <li>Los módulos extra otorgados en <b>Usuarios y roles</b> amplían el alcance de la misma forma.</li>
        </ul>
      </div>
    </div>
  );
}
