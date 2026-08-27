"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Piezas compartidas de los catálogos
// (Flota / Personal / Administración). Solo presentación: badges de
// vencimiento con semáforo y mensajes inline de guardado (UI-GUIA §3.9/§7.4).
// ════════════════════════════════════════════════════════════════════

import { diasParaVencer, fdate, vencCls } from "@/lib/transporte/logic";

/** Badge de vencimiento con semáforo: rojo vencido / ámbar ≤30 días / verde. */
export function VencBadge({ fecha }: { fecha?: string | null }) {
  if (!fecha) return <span className="muted">—</span>;
  const dias = diasParaVencer(fecha);
  const cls = vencCls(dias);
  const label =
    dias < 0 ? `Vencido hace ${-dias} día(s)` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día(s)`;
  return (
    <span>
      <span className={`badge ${cls}`}>{label}</span>
      <span className="cc-dias">{fdate(fecha)}</span>
    </span>
  );
}

/** Mensaje inline sobrio: error en rojo u OK en verde (sin toasts). */
export function MsgInline({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>;
  if (ok) return <div style={{ color: "var(--ok)", fontSize: 13 }}>{ok}</div>;
  return null;
}

/** Chip neutro para listas maestras (interventores, áreas, festivos oficiales). */
export function Chip({
  children,
  onRemove,
  title,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  title?: string;
}) {
  return (
    <span
      className="badge"
      title={title}
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Eliminar"
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--muted)",
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
