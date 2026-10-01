"use client";
// Carga la ficha del contrato creado en la app y monta su módulo (mismo motor
// que Contrato de Alquiler, con el espacio de datos "<id>:").

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContratoDinamico } from "@/lib/transporte/constants";
import { cargarContratos } from "@/lib/transporte/contratos";
import { TransporteClient } from "../transporte/TransporteClient";

export function ContratoAppClient({ id }: { id: string }) {
  const [contrato, setContrato] = useState<ContratoDinamico | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarContratos()
      .then((l) => { if (vivo) setContrato(l.find((c) => c.id === id) ?? null); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [id]);

  if (error) return <div className="info-bar" style={{ color: "var(--high)" }}>No se pudo cargar el contrato: {error}</div>;
  if (contrato === undefined) return <div className="table-wrap" style={{ padding: 18 }}><span className="muted">Cargando contrato…</span></div>;
  if (contrato === null) {
    return (
      <div className="info-bar">
        El contrato «{id}» no existe. <Link href="/aaa/contratos">Ver contratos</Link>
      </div>
    );
  }
  return (
    <TransporteClient
      key={contrato.id}
      ns={contrato.id}
      contrato={contrato}
      titulo={contrato.nombre}
      subtitulo={[contrato.numero ? `Contrato N° ${contrato.numero}` : "", contrato.objeto].filter(Boolean).join(" — ") + " — registros, tarifario, reportes y avance del contrato."}
    />
  );
}
