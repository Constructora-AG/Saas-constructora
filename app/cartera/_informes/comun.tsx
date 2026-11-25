"use client";
// Piezas compartidas por la lista, el formulario y la revisión de informes de cartera.
import { ESTADOS_INFORME, type AdjuntoInforme, type EstadoInforme, type ProyectoInforme, type ResumenInforme } from "@/lib/cartera/informes";

export const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-CO", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Porcentaje legible; sin base muestra un texto en lugar de #DIV/0!. */
export function pct(v: number | null, sinBase = "Sin base"): string {
  return v === null ? sinBase : PCT.format(v);
}

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EstadoBadge({ estado }: { estado: EstadoInforme }) {
  const e = ESTADOS_INFORME[estado] ?? { label: estado, cls: "warn", ayuda: "" };
  const icono = estado === "aprobado" ? "✓" : estado === "observado" ? "!" : estado === "enviado" ? "●" : "✎";
  return (
    <span
      className={`badge ${e.cls === "brand" ? "" : e.cls}`}
      style={e.cls === "brand" ? { background: "var(--brand-soft)", color: "var(--brand)" } : undefined}
      title={e.ayuda}
    >
      <span aria-hidden="true">{icono}</span> {e.label}
    </span>
  );
}

/** Cumplimiento con etiqueta de texto (no solo color). */
export function Cumplimiento({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="muted">Sin programado</span>;
  const cls = valor >= 1 ? "ok" : valor >= 0.8 ? "warn" : "high";
  const txt = valor >= 1 ? "Cumple" : valor >= 0.8 ? "Cerca" : "Bajo";
  return <span className={`badge ${cls}`}>{PCT.format(valor)} · {txt}</span>;
}

/** Cuadro por proyecto: recaudo, mora, cartera e indicadores, con subtotal. */
export function ResumenTabla({ resumen, caption, pendientes = [] }: { resumen: ResumenInforme; caption: string; pendientes?: ProyectoInforme[] }) {
  const hayseparaciones = resumen.subtotal.separaciones > 0;
  // Celdas compactas: con separaciones son 9 columnas y deben caber sin desplazar la tabla.
  const c = { padding: "10px 10px" } as const;
  const r = { textAlign: "right" as const, ...c };
  return (
    <div className="table-wrap table-scroll">
      <table className="clean" aria-label={caption}>
        <thead>
          <tr>
            <th scope="col" style={c}>Proyecto</th>
            {hayseparaciones && <th scope="col" style={r}>Pagado</th>}
            {hayseparaciones && <th scope="col" style={r}>Separaciones</th>}
            <th scope="col" style={r}>Recaudo real</th>
            <th scope="col" style={r}>Programado</th>
            <th scope="col" style={c}>Cumplimiento</th>
            <th scope="col" style={r}>Cartera en mora</th>
            <th scope="col" style={r}>Cartera total</th>
            <th scope="col" style={r}>Ind. cartera</th>
          </tr>
        </thead>
        <tbody>
          {resumen.proyectos.map((p) => (
            <tr key={p.proyecto}>
              <th scope="row" style={{ fontWeight: 600, color: "var(--text)", textAlign: "left", ...c, whiteSpace: "normal", minWidth: 130, borderTop: "1px solid var(--border)" }}>
                {p.nombre}
                {pendientes.includes(p.proyecto) && <> <span className="badge warn" style={{ marginLeft: 6 }}><span aria-hidden="true">!</span> Sin cifras</span></>}
              </th>
              {hayseparaciones && <td className="num" style={r}>{COP.format(p.pagado)}</td>}
              {hayseparaciones && <td className="num" style={r}>{p.separaciones ? `− ${COP.format(p.separaciones)}` : "—"}</td>}
              <td className="num" style={r}><b>{COP.format(p.real)}</b></td>
              <td className="num" style={r}>{COP.format(p.programado)}</td>
              <td style={c}><Cumplimiento valor={p.cumplimiento} /></td>
              <td className="num" style={r}>{COP.format(p.mora)}</td>
              <td className="num" style={r}>{COP.format(p.carteraTotal)}</td>
              <td className="num" style={r}>{pct(p.indicadorCartera, "—")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "var(--surface-2)" }}>
            <th scope="row" style={{ textAlign: "left", ...c, borderTop: "2px solid var(--border-strong)", color: "var(--text)" }}>Subtotal</th>
            {hayseparaciones && <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}>{COP.format(resumen.subtotal.pagado)}</td>}
            {hayseparaciones && <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}>− {COP.format(resumen.subtotal.separaciones)}</td>}
            <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}><b>{COP.format(resumen.subtotal.real)}</b></td>
            <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}><b>{COP.format(resumen.subtotal.programado)}</b></td>
            <td style={{ ...c, borderTop: "2px solid var(--border-strong)" }}><Cumplimiento valor={resumen.subtotal.cumplimiento} /></td>
            <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}><b>{COP.format(resumen.subtotal.mora)}</b></td>
            <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}><b>{COP.format(resumen.subtotal.carteraTotal)}</b></td>
            <td className="num" style={{ ...r, borderTop: "2px solid var(--border-strong)" }}><b>{pct(resumen.subtotal.indicadorCartera, "—")}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Adjuntos (mismo método que prefacturas: dataUrl en la base, ~4 MB) ──

export const MAX_ADJUNTO_BYTES = 4 * 1024 * 1024;

export function leerArchivo(f: File): Promise<AdjuntoInforme> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type || "application/octet-stream", dataUrl: String(r.result) });
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(f);
  });
}

function blobDeAdjunto(a: AdjuntoInforme): Blob {
  const [head, b64] = a.dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? a.type ?? "application/octet-stream";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Abre el adjunto en una pestaña nueva. Si viene de la API, pasa la pestaña
 * ya abierta (se abre en el clic para que el navegador no la bloquee).
 */
export function abrirAdjunto(a: AdjuntoInforme, ventana?: Window | null) {
  const url = URL.createObjectURL(blobDeAdjunto(a));
  if (ventana) {
    ventana.location.href = url;
  } else {
    const w = window.open(url, "_blank", "noopener");
    if (!w) {
      // Bloqueador de ventanas: se descarga.
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name;
      link.click();
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
