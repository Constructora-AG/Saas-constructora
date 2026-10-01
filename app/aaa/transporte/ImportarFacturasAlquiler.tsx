"use client";
// ════════════════════════════════════════════════════════════════════
// Contrato de Alquiler — paso único: las facturas AGF que se cargaron como
// tabla aparte (aaa_facturas) pasan a ser registros (servicios) del módulo.
// Cada factura crea un registro con fecha, equipo y valor; lo demás
// (interventor, área, placa, horas…) queda en blanco para completarlo luego.
// Los ya migrados se reconocen por `facturaAGF` y no se duplican.
// ════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { nuevoServicioId, type Servicio } from "@/lib/transporte/model";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import { useRegistrosContrato, type FacturaRow } from "../FacturasRegistro";
import { siguienteOrden } from "./ServicioForm";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function registroDe(f: FacturaRow, orderNo: string): Servicio {
  const equipos = f.concepto.replace(/^Alquiler:\s*/i, "").trim();
  return {
    id: nuevoServicioId(),
    date: f.fecha,
    orderNo,
    serviceType: "",
    interventor: "",
    areaAAA: "",
    plate: "",
    capacity: "",
    driver: "",
    operario: "",
    equipment: equipos,
    weight: "",
    pickup: "",
    destination: "",
    area: "",
    hourReq: "",
    hourAtt: "",
    value: String(Number(f.valor_total)),
    tolls: "0",
    photo: false,
    approved: false,
    invoiced: true,
    transporteEquipo: /transporte de equipo/i.test(f.concepto),
    facturaAGF: f.numero,
    prefactura: f.numero, // ya facturado: no se vuelve a prefacturar
    notes: [`Factura ${f.numero} (valor total con IVA). Pendiente completar información del registro.`, f.nota ?? ""].filter(Boolean).join(" "),
    photoFiles: [],
    approvalFile: null,
    tarifaCategoria: null,
    tarifaRuta: null,
  };
}

export function ImportarFacturasAlquiler({ t }: { t: UseTransporte }) {
  const facturas = useRegistrosContrato("alquiler");
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const yaMigradas = useMemo(() => {
    const set = new Set<string>();
    Object.values(t.servicesByMonth).forEach((arr) => (arr ?? []).forEach((s) => s.facturaAGF && set.add(s.facturaAGF.toUpperCase())));
    return set;
  }, [t.servicesByMonth]);

  const pendientes = useMemo(
    () =>
      facturas.rows
        .filter((f) => !yaMigradas.has(f.numero.toUpperCase()))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, "es", { numeric: true })),
    [facturas.rows, yaMigradas],
  );
  const total = pendientes.reduce((s, f) => s + Number(f.valor_total), 0);

  if (msg) {
    return <div className="info-bar" style={{ marginBottom: 14, color: msg.ok ? "var(--ok)" : "var(--high)" }}>{msg.texto}</div>;
  }
  if (facturas.cargando || pendientes.length === 0) return null;

  async function migrar() {
    if (!window.confirm(`Se crearán ${pendientes.length} registro(s) por ${COP.format(total)} a partir de las facturas AGF (marcados como facturados). La información faltante queda en blanco para completarla después. ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      // La vigencia debe cubrir la fecha de la primera factura para que el mes exista en Registros.
      const primera = pendientes[0].fecha;
      if (!t.admin?.contractStart || primera < t.admin.contractStart) {
        await t.saveAdminCfg((a) => { a.contractStart = `${primera.slice(0, 7)}-01`; });
      }
      // Órdenes consecutivas AL#### en orden cronológico, después de las ya existentes.
      const base = parseInt(siguienteOrden(t.servicesByMonth, "alquiler").replace(/\D/g, ""), 10);
      const items = pendientes.map((f, i) => ({
        monthKey: f.fecha.slice(0, 7),
        item: registroDe(f, `AL${String(base + i).padStart(4, "0")}`),
      }));
      await t.importServices(items);
      setMsg({ ok: true, texto: `Listo: ${items.length} registro(s) creados a partir de las facturas AGF. Complétalos con «Editar» en cada mes.` });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="info-bar" style={{ marginBottom: 14, alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        Hay <b>{pendientes.length}</b> factura(s) AGF ({COP.format(total)}) cargadas como tabla aparte que aún no son registros del contrato.
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => void migrar()} disabled={trabajando}>
        {trabajando ? "Creando registros…" : "Pasar a Registros"}
      </button>
    </div>
  );
}
