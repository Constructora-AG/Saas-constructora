"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconMessage } from "../icons";
import { AsistenteClient } from "./AsistenteClient";

/** Globito de chat flotante: abre el Asistente IA en cualquier pantalla. */
export function Burbuja() {
  const [abierta, setAbierta] = useState(false);
  const path = usePathname() ?? "";
  useEffect(() => { setAbierta(false); }, [path]);
  if (path === "/login" || path.startsWith("/asistente")) return null;
  return (
    <>
      {abierta && (
        <div className="burbuja-panel" role="dialog" aria-label="Asistente IA">
          <div className="burbuja-head">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><IconMessage /> <b>Asistente IA</b></span>
            <span style={{ display: "flex", gap: 6 }}>
              <a className="btn btn-ghost btn-sm" href="/asistente" title="Abrir en pantalla completa">Ampliar</a>
              <button className="btn btn-ghost btn-sm" onClick={() => setAbierta(false)} aria-label="Cerrar">✕</button>
            </span>
          </div>
          <div className="burbuja-body"><AsistenteClient compacto /></div>
        </div>
      )}
      <button className={`burbuja-btn${abierta ? " open" : ""}`} onClick={() => setAbierta((v) => !v)} aria-label={abierta ? "Cerrar asistente" : "Abrir asistente IA"} title="Asistente IA">
        {abierta ? "✕" : <IconMessage />}
      </button>
    </>
  );
}
