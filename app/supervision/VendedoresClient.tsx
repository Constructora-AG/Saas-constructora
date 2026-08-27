"use client";
import { useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mergeVendedores, rolLabel, ROLES, type Vendedor, type VendProspecto, type VendContacto } from "@/lib/vendedores";
import { DateRange, type Range } from "../DateRange";
import { IconUsers, IconKey, IconCoins, IconWhatsApp } from "../icons";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO");
const iniciales = (n: string) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function VendedoresClient({ initial }: { initial: Vendedor[] }) {
  const [allRows, setAllRows] = useState<Vendedor[]>(initial);
  const [loading, setLoading] = useState(false);
  const [rolFiltro, setRolFiltro] = useState("ventas");
  const first = useRef(true);

  // Roles presentes en los datos (para no mostrar filtros vacíos).
  const rolesPresentes = useMemo(() => {
    const set = new Set(allRows.map((r) => r.rol));
    return ROLES.filter((r) => set.has(r.key));
  }, [allRows]);

  const rows = useMemo(
    () => (rolFiltro === "todos" ? allRows : allRows.filter((r) => r.rol === rolFiltro)),
    [allRows, rolFiltro],
  );

  async function onRange(r: Range) {
    if (first.current) { first.current = false; return; } // el server ya trajo "Todo"
    const supa = supabaseBrowser();
    if (!supa) return;
    setLoading(true);
    const desde = r.from ? r.from.toISOString() : null;
    const hasta = r.to ? r.to.toISOString() : null;
    const [{ data: p }, { data: c }] = await Promise.all([
      supa.rpc("vend_prospectos", { desde, hasta }),
      supa.rpc("vend_contactos", { desde, hasta }),
    ]);
    setAllRows(mergeVendedores((p ?? []) as VendProspecto[], (c ?? []) as VendContacto[]));
    setLoading(false);
  }

  const tot = useMemo(() => rows.reduce((a, r) => ({
    prospectos: a.prospectos + r.total,
    ventas: a.ventas + r.compra,
    valor: a.valor + r.valor_ventas,
    contactos: a.contactos + r.contactos,
  }), { prospectos: 0, ventas: 0, valor: 0, contactos: 0 }), [rows]);

  return (
    <>
      <div className="filters-bar">
        <label className="field" style={{ gap: 7 }}>
          Rol
          <div className="segmented">
            {rolesPresentes.map((r) => (
              <button key={r.key} className={`seg${rolFiltro === r.key ? " active" : ""}`} onClick={() => setRolFiltro(r.key)}>{r.label}</button>
            ))}
            <button className={`seg${rolFiltro === "todos" ? " active" : ""}`} onClick={() => setRolFiltro("todos")}>Todos</button>
          </div>
        </label>
        <label className="field" style={{ gap: 7 }}>
          Período (por fecha de creación del prospecto)
          <DateRange defaultPreset="todo" onChange={onRange} />
        </label>
        {loading && <span className="muted" style={{ fontSize: 13 }}>Actualizando…</span>}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico"><IconUsers /></span><span className="kpi-label">Prospectos gestionados</span></div>
          <div className="kpi-value">{NUM.format(tot.prospectos)}</div>
          <div className="kpi-foot">{rows.length} vendedores</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-ok"><IconKey /></span><span className="kpi-label">Ventas cerradas</span></div>
          <div className="kpi-value">{NUM.format(tot.ventas)}</div>
          <div className="kpi-foot">unidades en etapa de compra</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico"><IconCoins /></span><span className="kpi-label">Valor vendido</span></div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(tot.valor)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-warn"><IconWhatsApp /></span><span className="kpi-label">Contactos digitales</span></div>
          <div className="kpi-value">{NUM.format(tot.contactos)}</div>
          <div className="kpi-foot">WhatsApp, web y otros</div>
        </div>
      </div>

      <div className="section-title">Desempeño por vendedor</div>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th style={{ textAlign: "right" }}>Prospectos</th>
              <th style={{ textAlign: "right" }}>Seguimiento</th>
              <th style={{ textAlign: "right" }}>Negociación</th>
              <th style={{ textAlign: "right" }}>Ventas</th>
              <th style={{ textAlign: "right" }}>Valor vendido</th>
              <th style={{ textAlign: "right" }}>Contactos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asesor}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar">{iniciales(r.asesor)}</span>
                    <b>{r.asesor}</b>
                  </div>
                </td>
                <td><span className="pill-estado"><b>{rolLabel(r.rol)}</b></span></td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.total)}</td>
                <td className="num" style={{ textAlign: "right" }}>{r.seguimiento || "—"}</td>
                <td className="num" style={{ textAlign: "right" }}>{r.negociacion || "—"}</td>
                <td style={{ textAlign: "right" }}>{r.compra ? <span className="badge ok">{r.compra}</span> : <span className="muted">0</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>{r.valor_ventas ? COP.format(r.valor_ventas) : <span className="muted">—</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>
                  {NUM.format(r.contactos)}
                  {r.whatsapp > 0 && <span className="muted" style={{ fontSize: 11.5 }}> · {r.whatsapp} wa</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 28 }}>Sin datos en este período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
