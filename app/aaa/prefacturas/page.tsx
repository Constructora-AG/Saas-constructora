// Antes, todas las prefacturas vivían aquí. Ahora cada contrato tiene su propio
// módulo de prefacturas; esta página solo resume y lleva a cada uno.
import Link from "next/link";
import { cargarContratosServidor } from "@/lib/aaa/prefacturasServidor";
import { rutaPrefacturasContrato } from "@/lib/aaa/rutasContrato";
import { DEMO_PREFACTURAS, supabaseConfigured } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/server";
import { esModuloBase, FICHA_MODULO } from "@/lib/transporte/constants";
import { exigirModuloAaa } from "../_auth";

export const metadata = { title: "Prefacturas por contrato — AG Constructora" };
export const dynamic = "force-dynamic";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const ACTIVAS = new Set(["pendiente_acta_migo", "por_facturar", "pendiente_pago"]);

export default async function PrefacturasPorContrato() {
  // Resume las prefacturas de TODOS los contratos: solo Proyecto Triple A.
  await exigirModuloAaa("aaa");
  const filas: Array<{ contrato: string; estado: string; valor_base: number }> = supabaseConfigured()
    ? (((await supabaseAdmin().from("aaa_prefacturas").select("contrato,estado,valor_base")).data ?? []) as Array<{ contrato: string; estado: string; valor_base: number }>)
    : (DEMO_PREFACTURAS as Array<{ contrato: string; estado: string; valor_base: number }>);
  const contratos = [
    ...(["alquiler", "emergencia", "transporte", "recoleccion"] as const).map((id) => ({ id, nombre: FICHA_MODULO[id].nombre })),
    ...(await cargarContratosServidor()).filter((c) => !esModuloBase(c.id)).map((c) => ({ id: c.id, nombre: c.nombre })),
  ];
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Proyecto Triple A · Prefacturas</h1>
        <p className="page-sub">Cada contrato tiene su propio módulo de prefacturas. Elige el contrato.</p>
      </div>
      <div className="table-wrap">
        <table className="clean" style={{ width: "100%" }}>
          <thead>
            <tr><th>Contrato</th><th style={{ textAlign: "right" }}>Prefacturas</th><th style={{ textAlign: "right" }}>Activas</th><th style={{ textAlign: "right" }}>Valor activo (sin IVA)</th><th /></tr>
          </thead>
          <tbody>
            {contratos.map((c) => {
              const del = filas.filter((f) => f.contrato === c.id);
              const activas = del.filter((f) => ACTIVAS.has(f.estado));
              return (
                <tr key={c.id}>
                  <td><Link href={rutaPrefacturasContrato(c.id)}><b>{c.nombre}</b></Link></td>
                  <td className="num" style={{ textAlign: "right" }}>{del.length}</td>
                  <td className="num" style={{ textAlign: "right" }}>{activas.length}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(activas.reduce((s, f) => s + Number(f.valor_base), 0))}</td>
                  <td style={{ textAlign: "right" }}><Link className="btn btn-ghost btn-sm" href={rutaPrefacturasContrato(c.id)}>Abrir</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
