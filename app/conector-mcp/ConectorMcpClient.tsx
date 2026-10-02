"use client";
// Guía paso a paso del conector MCP. El token que pega el usuario solo vive en
// el estado de esta página (no se guarda ni se envía): sirve para dejar listos
// la dirección y el comando de copiar.

import { useState, type ReactNode } from "react";
import { IconCheck, IconInfo, IconKey } from "../icons";

const TOKEN_OK = /^[0-9a-f]{64}$/i;

function Copiable({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "sel">("");
  const copiar = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const pre = e.currentTarget.parentElement?.querySelector("code");
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      setEstado("sel");
    }
    setTimeout(() => setEstado(""), 1600);
  };
  return (
    <div style={{ position: "relative", background: "#0f1d33", color: "#e6ecf5", borderRadius: 8, padding: "12px 92px 12px 14px", overflowX: "auto" }}>
      <code style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "none", color: "inherit" }}>{texto}</code>
      <button type="button" onClick={(e) => void copiar(e)}
        style={{ position: "absolute", top: 8, right: 8, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,.1)", color: "#e6ecf5", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
        {estado === "ok" ? "Copiado" : estado === "sel" ? "Seleccionado" : "Copiar"}
      </button>
    </div>
  );
}

function Pasos({ children }: { children: ReactNode }) {
  return <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>{children}</ol>;
}
function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <li style={{ display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 700, fontSize: 14, display: "grid", placeItems: "center" }}>{n}</span>
      <div style={{ display: "grid", gap: 6, minWidth: 0, paddingTop: 4, fontSize: 14, lineHeight: 1.55 }}>
        <b style={{ fontSize: 14.5 }}>{titulo}</b>
        {children}
      </div>
    </li>
  );
}
const Ui = ({ children }: { children: ReactNode }) => <b style={{ whiteSpace: "nowrap" }}>«{children}»</b>;
const Seccion = ({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) => (
  <>
    <div className="section-title" id={id}>{titulo}</div>
    <div className="table-wrap" style={{ padding: 18, display: "grid", gap: 14, marginBottom: 22 }}>{children}</div>
  </>
);

const HERRAMIENTAS: Array<[string, string]> = [
  ["describir_datos", "Explica las tablas, el significado de cada columna y cómo calcula la plataforma cada cifra, para que las respuestas coincidan con lo que muestra la app."],
  ["consultar_sql", "Consultas de solo lectura sobre cartera y cobranza, recaudo, prospectos, vendedores, marketing y leads, prefacturas y facturas de Triple A. Hasta 300 filas por consulta."],
  ["listar_contratos", "Contratos de Proyecto Triple A con número, objeto, valor, vigencia y prefijo de órdenes."],
  ["consultar_registros", "Registros de un contrato por rango de fechas, interventor, área AAA o estado de prefactura, con totales por ítem, ruta del pliego y recargo (nocturno, dominical) y por interventor."],
  ["tarifario_contrato", "Ítems, rutas del pliego o zonas, valores unitarios sin IVA y recargos de un contrato."],
];

const EJEMPLOS: Array<[string, string]> = [
  ["¿Cuánto se facturó en Transporte AAA del 1 al 30 de septiembre, por interventor?", "consultar_registros"],
  ["De los registros de septiembre, ¿cuántos fueron con recargo nocturno o dominical y por qué valor, por ítem y ruta?", "consultar_registros"],
  ["¿Qué registros del área Acueducto aún no están prefacturados?", "consultar_registros"],
  ["¿Cuál es el saldo total de cartera y cuántas unidades están en mora de más de 60 días?", "consultar_sql"],
  ["¿Cuánto se recaudó por proyecto en los últimos tres meses?", "consultar_sql"],
  ["¿Cuántos leads llegaron por canal este mes y cuántos ya tienen gestión?", "consultar_sql"],
  ["¿Cuál es el valor unitario de cada ruta del pliego en el Contrato de Alquiler?", "tarifario_contrato"],
  ["Hazme un informe ejecutivo de Proyecto Triple A de septiembre, con hallazgos y recomendaciones.", "varias herramientas"],
];

export function ConectorMcpClient({ endpoint, activo }: { endpoint: string; activo: boolean }) {
  const [token, setToken] = useState("");
  const [verToken, setVerToken] = useState(false);
  const [donde, setDonde] = useState<"web" | "code">("web");
  const t = token.trim();
  const tok = t || "<TU_TOKEN>";
  const urlWeb = `${endpoint}?key=${tok}`;
  const cmdAdd = `claude mcp add --transport http --scope user ag-datos ${endpoint} --header "Authorization: Bearer ${tok}"`;

  return (
    <div style={{ maxWidth: 920 }}>
      <div className="info-bar" style={activo ? undefined : { background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
        {activo ? <IconCheck /> : <IconInfo />}
        <div>
          {activo
            ? <><b>Conector activo.</b> Dirección del servidor: <code>{endpoint}</code></>
            : <><b>Conector apagado.</b> Falta la variable <code>MCP_TOKEN</code> en Vercel (proyecto <code>saas-constructora</code>, entorno Production). Créala con un valor aleatorio de 64 caracteres y vuelve a publicar la app.</>}
        </div>
      </div>

      <Seccion id="antes" titulo="Antes de empezar">
        <Pasos>
          <Paso n={1} titulo="Ten el token a mano">
            <span>El token es una clave de 64 caracteres que abre el acceso. Lo administra Gerencia y nunca se muestra en la plataforma. Trátalo como una contraseña.</span>
          </Paso>
          <Paso n={2} titulo="Revisa tu plan de Claude">
            <span>Los conectores personalizados de claude.ai y Claude Desktop están en los planes Pro, Max, Team y Enterprise. En Team o Enterprise puede que un administrador de la organización deba agregarlo primero.</span>
          </Paso>
          <Paso n={3} titulo="Pega aquí el token (opcional)">
            <span>Así la dirección y el comando de abajo quedan listos para copiar. El token solo vive en esta página: no se guarda ni se envía.</span>
          </Paso>
        </Pasos>
        <label className="field" htmlFor="mcp-token" style={{ marginTop: 4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconKey width={14} height={14} /> Token</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input id="mcp-token" className="input" type={verToken ? "text" : "password"} autoComplete="off" spellCheck={false}
              placeholder="Pega aquí el token" value={token} onChange={(e) => setToken(e.target.value)}
              style={{ flex: "1 1 280px", minWidth: 0, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerToken((v) => !v)}>{verToken ? "Ocultar" : "Mostrar"}</button>
          </div>
          <span style={{ color: t && !TOKEN_OK.test(t) ? "var(--high)" : "var(--muted)" }}>
            {!t ? "Sin token: los comandos muestran <TU_TOKEN> para reemplazarlo a mano."
              : TOKEN_OK.test(t) ? "Listo: la dirección y el comando ya incluyen tu token."
              : "Ese token no parece completo: debe tener 64 caracteres (letras a–f y números)."}
          </span>
        </label>
      </Seccion>

      <div className="section-title" id="conectar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Conectar paso a paso</span>
        <span style={{ flex: 1 }} />
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={donde === "web"} className={`seg${donde === "web" ? " active" : ""}`} onClick={() => setDonde("web")}>claude.ai y Claude Desktop</button>
          <button role="tab" aria-selected={donde === "code"} className={`seg${donde === "code" ? " active" : ""}`} onClick={() => setDonde("code")}>Claude Code (terminal)</button>
        </div>
      </div>
      <div className="table-wrap" style={{ padding: 18, display: "grid", gap: 14, marginBottom: 22 }}>
        {donde === "web" ? (
          <>
            <Pasos>
              <Paso n={1} titulo="Abre la configuración de conectores">
                <span>En <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a>, haz clic en tu nombre (abajo a la izquierda) y entra a <Ui>Configuración</Ui> → <Ui>Conectores</Ui>.</span>
              </Paso>
              <Paso n={2} titulo="Agrega un conector personalizado">
                <span>Al final de la lista, haz clic en <Ui>Agregar conector personalizado</Ui>.</span>
              </Paso>
              <Paso n={3} titulo="Escribe el nombre">
                <span>Por ejemplo: <code>AG Datos</code>.</span>
              </Paso>
              <Paso n={4} titulo="Pega la dirección con el token">
                <span>En el campo de URL pega la dirección completa. El token va al final, después de <code>?key=</code>.</span>
                <Copiable texto={urlWeb} />
                <span className="muted">Si aparecen campos de OAuth (Client ID, Client Secret) en la configuración avanzada, déjalos vacíos.</span>
              </Paso>
              <Paso n={5} titulo="Guarda">
                <span>Haz clic en <Ui>Agregar</Ui>. El conector aparece en la lista con sus 5 herramientas.</span>
              </Paso>
              <Paso n={6} titulo="Actívalo en la conversación">
                <span>En un chat nuevo, abre el menú de herramientas (junto al cuadro de texto) y verifica que <b>AG Datos</b> esté encendido. La primera vez Claude pide permiso para usar cada herramienta; puedes permitirla siempre.</span>
              </Paso>
            </Pasos>
            <div className="muted" style={{ fontSize: 13 }}><b>Claude Desktop:</b> con la misma cuenta, el conector aparece solo. Si no lo ves, cierra y vuelve a abrir la app.</div>
          </>
        ) : (
          <>
            <Pasos>
              <Paso n={1} titulo="Abre la terminal">
                <span>Necesitas Claude Code instalado (<a href="https://docs.claude.com/en/docs/claude-code/overview" target="_blank" rel="noopener noreferrer">guía de instalación</a>).</span>
              </Paso>
              <Paso n={2} titulo="Agrega el servidor">
                <span>Ejecuta este comando. <code>--scope user</code> lo deja disponible en todos tus proyectos.</span>
                <Copiable texto={cmdAdd} />
              </Paso>
              <Paso n={3} titulo="Verifica que conecta">
                <span><code>ag-datos</code> debe aparecer como conectado (✓ Connected).</span>
                <Copiable texto="claude mcp list" />
              </Paso>
              <Paso n={4} titulo="Úsalo">
                <span>Abre <code>claude</code> y pregunta normalmente. Dentro de Claude Code, <code>/mcp</code> muestra el estado del servidor y sus herramientas.</span>
              </Paso>
            </Pasos>
            <div className="muted" style={{ fontSize: 13 }}><b>Para quitarlo:</b> <code>claude mcp remove ag-datos --scope user</code></div>
          </>
        )}
      </div>

      <Seccion id="probar" titulo="Probar la conexión">
        <span style={{ fontSize: 14 }}>Escríbele a Claude:</span>
        <Copiable texto="Usa AG Datos y dime qué contratos de Proyecto Triple A hay, con su número y vigencia." />
        <span style={{ fontSize: 14 }}>Debe responder con la lista de contratos (Transporte AAA, Contrato de Alquiler, Otro Sí / Emergencia y los creados en la app). Si dice que no tiene acceso, revisa <a href="#problemas">Si algo falla</a>.</span>
      </Seccion>

      <div className="section-title" id="herramientas">Qué puede consultar</div>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table className="clean" style={{ width: "100%" }}>
          <thead><tr><th>Herramienta</th><th>Qué hace</th></tr></thead>
          <tbody>
            {HERRAMIENTAS.map(([n, d]) => (
              <tr key={n}><td style={{ whiteSpace: "nowrap" }}><code>{n}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 22px" }}>Claude elige la herramienta solo. No se exponen los usuarios de la plataforma, las claves de la IA ni el costo interno a contratistas de Transporte AAA.</p>

      <div className="section-title" id="ejemplos">Preguntas de ejemplo</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 8 }}>
        {EJEMPLOS.map(([q, h]) => (
          <div key={q} className="table-wrap" style={{ padding: "12px 14px", fontSize: 14 }}>
            {q}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{h}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 22px" }}>Cada contrato de Proyecto Triple A es independiente: Claude no los suma entre sí salvo que se lo pidas.</p>

      <Seccion id="seguridad" titulo="Seguridad del token">
        <div className="info-bar" style={{ background: "var(--warn-soft)", borderColor: "#ecd9a8", color: "var(--warn)", margin: 0 }}>
          <IconInfo />
          <div><b>Trátalo como una contraseña.</b> Quien lo tenga puede leer todos estos datos, incluidos los datos personales de los clientes en cartera (cédula, celular, correo). No lo pegues en chats, correos ni documentos compartidos.</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 14 }}>
          <li>Guárdalo en un gestor de contraseñas.</li>
          <li>Si se filtra o alguien deja la empresa, cámbialo: en Vercel, proyecto <code>saas-constructora</code>, edita la variable <code>MCP_TOKEN</code> y vuelve a publicar la app. El token anterior deja de funcionar de inmediato.</li>
          <li>Después de cambiarlo, cada persona debe actualizar su conector (en claude.ai, eliminarlo y volver a agregarlo; en Claude Code, quitarlo y volver a agregarlo con el comando).</li>
        </ul>
      </Seccion>

      <Seccion id="problemas" titulo="Si algo falla">
        <dl style={{ margin: 0, display: "grid", gap: 12, fontSize: 14 }}>
          {([
            ["Claude dice que no puede conectarse o que no está autorizado (401)", "El token está mal copiado o ya no es válido. Revisa que no tenga espacios al inicio o al final y que tenga 64 caracteres. Si lo cambiaron, usa el nuevo."],
            ["El servidor responde que no está habilitado (503)", "Falta la variable MCP_TOKEN en Vercel o la app no se volvió a publicar después de crearla. El aviso de arriba en esta página lo indica."],
            ["El conector está agregado, pero Claude no lo usa", "Verifica que esté encendido en el menú de herramientas del chat y pídeselo explícitamente: «Usa AG Datos para…»."],
            ["La respuesta dice que se truncó a 300 filas", "Pide totales o agrupaciones en lugar de listados completos, o acota el rango de fechas."],
            ["Una cifra no coincide con la de la app", "Pídele a Claude la consulta y los filtros que usó (fechas, contrato, estado). Los registros de contratos se leen en vivo; la cartera y el CRM se sincronizan una vez al día desde Smarthome."],
          ] as const).map(([q, a]) => (
            <div key={q}>
              <dt style={{ fontWeight: 700 }}>{q}</dt>
              <dd style={{ margin: "3px 0 0", color: "var(--text-2)" }}>{a}</dd>
            </div>
          ))}
        </dl>
      </Seccion>
    </div>
  );
}
