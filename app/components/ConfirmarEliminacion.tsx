"use client";
// ════════════════════════════════════════════════════════════════════
// Confirmación de eliminación dentro de la página (reemplaza window.confirm).
//
// Uso típico:
//   const [porEliminar, setPorEliminar] = useState<Vehiculo | null>(null);
//   <button onClick={() => setPorEliminar(v)}>Eliminar</button>
//   <ConfirmarEliminacion
//     abierto={!!porEliminar}
//     titulo={`¿Eliminar el vehículo ${porEliminar?.plate}?`}
//     descripcion="No borra los servicios ya registrados con esa placa."
//     onCancelar={() => setPorEliminar(null)}
//     onConfirmar={async () => { if (porEliminar) await eliminar(porEliminar); setPorEliminar(null); }}
//   />
//
// - variante "ventana" (por defecto): aviso centrado sobre la página, para
//   acciones en tablas y listas. "en-linea": recuadro dentro del contenido,
//   junto al elemento que se va a eliminar.
// - El foco arranca en «Cancelar» (un Enter accidental no borra), Esc cierra,
//   Tab no sale de la ventana y al cerrar el foco vuelve a donde estaba.
// - Mientras onConfirmar está en curso los botones quedan deshabilitados; si
//   lanza un error, el mensaje se muestra en el aviso y este sigue abierto.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ConfirmarEliminacionProps {
  /** Muestra u oculta el aviso. */
  abierto: boolean;
  /** Pregunta principal, p. ej. «¿Eliminar la prefactura PF0012?». */
  titulo: string;
  /** Consecuencias de la acción (qué se borra y qué no). */
  descripcion?: ReactNode;
  /** Agrega «Esta acción no se puede deshacer.» (por defecto sí). */
  irreversible?: boolean;
  /** Texto del botón de confirmar (por defecto «Sí, eliminar»). */
  textoConfirmar?: string;
  /** Texto mientras se ejecuta (por defecto «Eliminando…»). */
  textoOcupado?: string;
  /** Texto del botón de cancelar (por defecto «Cancelar»). */
  textoCancelar?: string;
  /** "ventana" (centrada sobre la página) o "en-linea" (dentro del contenido). */
  variante?: "ventana" | "en-linea";
  onConfirmar: () => void | Promise<void>;
  onCancelar: () => void;
}

export function ConfirmarEliminacion({
  abierto,
  titulo,
  descripcion,
  irreversible = true,
  textoConfirmar = "Sí, eliminar",
  textoOcupado = "Eliminando…",
  textoCancelar = "Cancelar",
  variante = "ventana",
  onConfirmar,
  onCancelar,
}: ConfirmarEliminacionProps) {
  const idBase = useId();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const cancelarRef = useRef<HTMLButtonElement | null>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);

  // Al abrir: guarda el foco actual y lo pasa a «Cancelar». Al cerrar: lo devuelve.
  useEffect(() => {
    if (!abierto) return;
    focoPrevio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(null);
    setOcupado(false);
    cancelarRef.current?.focus();
    return () => {
      const previo = focoPrevio.current;
      if (previo && document.contains(previo)) previo.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  const cancelar = () => { if (!ocupado) onCancelar(); };
  const confirmar = async () => {
    setError(null);
    setOcupado(true);
    try {
      await onConfirmar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la eliminación.");
    } finally {
      setOcupado(false);
    }
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); cancelar(); return; }
    // En la ventana el foco no sale del aviso con Tab.
    if (variante === "ventana" && e.key === "Tab" && cajaRef.current) {
      const focables = Array.from(cajaRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!focables.length) return;
      const primero = focables[0], ultimo = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
  };

  const caja = (
    <div
      ref={cajaRef}
      className={`confirmar confirmar-${variante}`}
      role="alertdialog"
      aria-modal={variante === "ventana" ? true : undefined}
      aria-labelledby={`${idBase}-titulo`}
      aria-describedby={`${idBase}-texto`}
      onKeyDown={alTeclado}
    >
      <p id={`${idBase}-titulo`} className="confirmar-titulo">{titulo}</p>
      <div id={`${idBase}-texto`} className="confirmar-texto">
        {descripcion}
        {irreversible && <> {descripcion ? " " : ""}Esta acción no se puede deshacer.</>}
      </div>
      {error && <p className="confirmar-error" role="alert">{error}</p>}
      <div className="confirmar-acciones">
        <button type="button" className="btn btn-sm btn-peligro" onClick={() => void confirmar()} disabled={ocupado}>
          {ocupado ? textoOcupado : textoConfirmar}
        </button>
        <button ref={cancelarRef} type="button" className="btn btn-ghost btn-sm" onClick={cancelar} disabled={ocupado}>
          {textoCancelar}
        </button>
      </div>
    </div>
  );

  if (variante === "en-linea") return caja;
  return (
    <div className="confirmar-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) cancelar(); }}>
      {caja}
    </div>
  );
}
