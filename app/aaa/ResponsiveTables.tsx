"use client";
import { useEffect } from "react";

/**
 * Etiqueta cada <td> con el encabezado de su columna (data-l) para que en
 * pantallas pequeñas las tablas del módulo se muestren como tarjetas
 * (CSS .tx-mod en globals.css). Observa el DOM: sirve para todas las vistas
 * y sobrevive a re-renders sin tocar cada tabla.
 */
export function ResponsiveTables() {
  useEffect(() => {
    const root = document.querySelector(".tx-mod");
    if (!root) return;
    const etiquetar = () => {
      root.querySelectorAll<HTMLTableElement>("table.clean").forEach((table) => {
        const ths = Array.from(table.querySelectorAll("thead th")).map((th) => (th.textContent || "").trim());
        if (!ths.length) return;
        table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
          let col = 0;
          Array.from(tr.children).forEach((td) => {
            const span = Number((td as HTMLTableCellElement).colSpan || 1);
            const label = span > 1 ? "" : ths[col] ?? "";
            if ((td as HTMLElement).dataset.l !== label) (td as HTMLElement).dataset.l = label;
            col += span;
          });
        });
      });
    };
    etiquetar();
    const obs = new MutationObserver(() => etiquetar());
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
