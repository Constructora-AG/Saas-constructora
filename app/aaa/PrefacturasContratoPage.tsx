// Módulo de prefacturas propio de un contrato (anidado bajo el contrato en el
// menú). Solo muestra y crea prefacturas de ESE contrato.
import Link from "next/link";
import { cargarPrefacturasContrato } from "@/lib/aaa/prefacturasServidor";
import { rutaModuloContrato } from "@/lib/aaa/rutasContrato";
import { IconInfo } from "../icons";
import { PrefacturasClient } from "./PrefacturasClient";

export async function PrefacturasContratoPage({ contrato, nombre, numero }: { contrato: string; nombre: string; numero?: string }) {
  const { prefacturas, maestros, loadError, demo } = await cargarPrefacturasContrato(contrato);
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{nombre} · Prefacturas</h1>
        <p className="page-sub">
          Prefacturas {numero ? `del contrato ${numero}` : "de este contrato"}: las generadas desde sus{" "}
          <Link href={rutaModuloContrato(contrato)}>Registros</Link> y las que se registren aquí. No se mezclan con las de otros contratos.
        </p>
      </div>

      {loadError && (
        <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
          <IconInfo />
          <div><b>No se pudieron cargar las prefacturas.</b><div style={{ marginTop: 2 }}>{loadError}</div></div>
        </div>
      )}

      <PrefacturasClient key={contrato} initialRows={prefacturas} demo={demo} maestros={maestros} contrato={contrato} contratoLabel={nombre} />
    </>
  );
}
