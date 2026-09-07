"use client";
import { Fragment, useState } from "react";
import type { Consolidado, CorteAaa, Maquina, ResumenFinanciero } from "@/lib/aaa/types";
import { ADMIN_PCT, INGRESO_IVA_PCT, panelUtilidad } from "@/lib/aaa/compute";
import { IconAlert, IconBuilding, IconChart, IconCheck, IconCoins, IconInfo, IconWallet } from "../icons";
import type { PrefacturaRow } from "@/lib/aaa/catalogo";
import { PrefacturasClient } from "./PrefacturasClient";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Tab = "consolidado" | "alquiler" | "emergencia" | "prefacturas";

function fmtShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)} mil M`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return COP.format(n);
}

function fdate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

// Valor base o con IVA según el modo seleccionado.
function v(obj: Record<string, unknown>, campo: string, conIva: boolean): number {
  const key = conIva ? `${campo}_con_iva` : `${campo}_base`;
  return Number(obj[key] ?? 0);
}

function Bar({ label, value, total, money = true }: { label: string; value: number; total: number; money?: boolean }) {
  const p = pct(value, total);
  return (
    <div className="bar-row">
      <div className="bar-name">{label}</div>
      <div className="bar-track">
        <div className={`bar-fill${p >= 100 ? " full" : ""}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <div className="bar-val">
        <b>{money ? fmtShort(value) : value}</b>
        <div className="bar-pct">{p.toFixed(1)}% del presupuesto</div>
      </div>
    </div>
  );
}

function Kpis({ obj, conIva }: { obj: ResumenFinanciero; conIva: boolean }) {
  const presupuesto = v(obj as unknown as Record<string, unknown>, "presupuesto", conIva);
  const consumido = v(obj as unknown as Record<string, unknown>, "consumido", conIva);
  const facturado = v(obj as unknown as Record<string, unknown>, "facturado", conIva);
  const prefactura = v(obj as unknown as Record<string, unknown>, "prefactura", conIva);
  const proyectado = v(obj as unknown as Record<string, unknown>, "proyectado", conIva);
  const porFacturar = presupuesto - facturado - prefactura;
  const desviacion = proyectado - presupuesto;
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico"><IconWallet /></span><span className="kpi-label">Presupuesto {conIva ? "con IVA" : "sin IVA"}</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(presupuesto)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico s-warn"><IconCoins /></span><span className="kpi-label">Consumido — costo interno AG</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(consumido)}</div>
        <div className="kpi-foot">{pct(consumido, presupuesto).toFixed(1)}% del presupuesto</div>
      </div>
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Facturado a Triple A</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(facturado)}</div>
        <div className="kpi-foot">{pct(facturado, presupuesto).toFixed(1)}% del presupuesto</div>
      </div>
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico s-warn"><IconAlert /></span><span className="kpi-label">En prefactura (ejecutado)</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(prefactura)}</div>
        <div className="kpi-foot">pendiente de orden de facturación</div>
      </div>
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico"><IconChart /></span><span className="kpi-label">Por facturar</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(porFacturar)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-head"><span className="kpi-ico"><IconBuilding /></span><span className="kpi-label">Proyectado al cierre</span></div>
        <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(proyectado)}</div>
        <div className="kpi-foot" style={{ color: desviacion > 0 ? "var(--high)" : "var(--ok)" }}>
          {desviacion > 0 ? "+" : ""}{fmtShort(desviacion)} vs. presupuesto
        </div>
      </div>
    </div>
  );
}

function UtilPanel({ obj, titulo }: { obj: ResumenFinanciero | Consolidado; titulo: string }) {
  const u = panelUtilidad(obj);
  if (u.facturadoConIva === null && u.prefacturaConIva === 0) {
    return (
      <div className="table-wrap" style={{ padding: 18 }}>
        <div className="chart-title">Prefactura, impuestos y utilidad estimada</div>
        <div className="muted">Aún no hay datos de facturación ni prefactura para calcular la utilidad de {titulo}.</div>
      </div>
    );
  }
  const good = u.utilidadConPrefactura >= 0;
  const goodFinal = u.utilidadFinal >= 0;
  return (
    <div className="table-wrap" style={{ padding: "18px 20px" }}>
      <div className="chart-title">Prefactura y utilidad estimada — {titulo}</div>
      <div className="chart-sub">valores con IVA salvo donde se indique</div>
      <div className="util-rows">
        <div className="util-row"><span>Facturado a Triple A (con IVA)</span><b>{u.facturadoConIva === null ? "— sin datos —" : COP.format(u.facturadoConIva)}</b></div>
        <div className="util-row u-pref"><span>(+) En prefactura — ejecutado, pendiente de facturar</span><b>{COP.format(u.prefacturaConIva)}</b></div>
        <div className="util-row"><span>Total facturado + prefactura (con IVA)</span><b>{COP.format(u.totalConIva)}</b></div>
        <div className="util-row u-info"><span>IVA recaudado (no es ingreso de AG, se remite a la DIAN)</span><b>{COP.format(u.ivaRecaudado)}</b></div>
        <div className="util-row"><span>Neto sin IVA (facturado + prefactura)</span><b>{COP.format(u.netoSinIva)}</b></div>
        <div className="util-row u-neg"><span>(−) Administración externa ({(ADMIN_PCT * 100).toFixed(1)}% s/ valor con IVA)</span><b>{COP.format(u.adminExterna)}</b></div>
        <div className="util-row u-neg"><span>(−) Consumido — costo interno AG (sin IVA)</span><b>{COP.format(u.consumidoBase)}</b></div>
        {u.indirectosConsumido !== null ? (
          <div className="util-row u-neg"><span>(−) Costos indirectos AAA consumidos a la fecha</span><b>{COP.format(u.indirectosConsumido)}</b></div>
        ) : (
          <div className="util-row u-info"><span>Los indirectos no están discriminados por contrato: se descuentan solo en Consolidado</span><b>ver Consolidado</b></div>
        )}
        <div className={`util-row u-total ${good ? "pos" : "neg"}`}>
          <span>Utilidad estimada (incluyendo prefactura)</span>
          <b>{COP.format(u.utilidadConPrefactura)} <span className={`badge ${good ? "ok" : "high"}`}>{good ? "POSITIVA" : "NEGATIVA"}</span></b>
        </div>
        <div className="util-row u-pos"><span>(+) Ingreso por IVA facturado ({(INGRESO_IVA_PCT * 100).toFixed(0)}% del IVA recaudado)</span><b>{COP.format(u.ingresoIva)}</b></div>
        <div className={`util-row u-total u-final ${goodFinal ? "pos" : "neg"}`}>
          <span>Utilidad final ajustada</span>
          <b>{COP.format(u.utilidadFinal)} <span className={`badge ${goodFinal ? "ok" : "high"}`}>{goodFinal ? "POSITIVA" : "NEGATIVA"}</span></b>
        </div>
        {u.utilidadSoloFacturado !== null && u.diferenciaPrefactura !== null && (
          <>
            <div className="util-row u-info"><span>Utilidad usando solo el facturado oficial (sin prefactura)</span><b>{COP.format(u.utilidadSoloFacturado)}</b></div>
            <div className="util-row u-info"><span>↳ Diferencia que explica la prefactura</span><b>+{COP.format(u.diferenciaPrefactura)}</b></div>
          </>
        )}
      </div>
    </div>
  );
}

const ITEM_LABELS: Record<string, string> = {
  alquiler_bquilla: "Alquiler B/quilla",
  alquiler_municipios: "Alquiler municipios",
  transporte_bquilla: "Transporte B/quilla",
  transporte_municipios: "Transporte municipios",
  horas_extra: "Horas extra",
};

function MaquinasTable({ machines, conIva }: { machines: Maquina[]; conIva: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="table-wrap table-scroll">
      <table className="clean">
        <thead>
          <tr>
            <th>Máquina</th>
            <th style={{ textAlign: "right" }}>Presupuesto</th>
            <th style={{ textAlign: "right" }}>Consumido</th>
            <th style={{ textAlign: "right" }}>Facturado</th>
            <th style={{ textAlign: "right" }}>Prefactura</th>
            <th style={{ textAlign: "right" }}>Proyectado</th>
            <th style={{ textAlign: "right" }}>Utilidad (c/ pref.)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m) => {
            const rec = m as unknown as Record<string, unknown>;
            const open = abierta === m.nombre;
            const util = m.utilidad_con_prefactura;
            return (
              <Fragment key={m.nombre}>
                <tr style={{ cursor: "pointer" }} onClick={() => setAbierta(open ? null : m.nombre)}>
                  <td><b>{m.nombre}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{fmtShort(v(rec, "presupuesto", conIva))}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {fmtShort(v(rec, "consumido", conIva))}
                    <span className="cc-dias">{pct(v(rec, "consumido", conIva), v(rec, "presupuesto", conIva)).toFixed(0)}%</span>
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {fmtShort(v(rec, "facturado", conIva))}
                    <span className="cc-dias">{pct(v(rec, "facturado", conIva), v(rec, "presupuesto", conIva)).toFixed(0)}%</span>
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{m.prefactura_base > 0 ? fmtShort(v(rec, "prefactura", conIva)) : "—"}</td>
                  <td className="num" style={{ textAlign: "right" }}>{fmtShort(v(rec, "proyectado", conIva))}</td>
                  <td className="num" style={{ textAlign: "right", color: util >= 0 ? "var(--ok)" : "var(--high)", fontWeight: 600 }}>
                    {fmtShort(util)}
                  </td>
                  <td className="muted" style={{ width: 30 }}>{open ? "▾" : "▸"}</td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={8} style={{ background: "var(--surface-2)", padding: "10px 18px 16px" }}>
                      <table className="clean" style={{ fontSize: 12.5 }}>
                        <thead>
                          <tr>
                            <th>Ítem</th>
                            <th style={{ textAlign: "right" }}>Presup. cant.</th>
                            <th style={{ textAlign: "right" }}>Presupuesto</th>
                            <th style={{ textAlign: "right" }}>Cons. cant.</th>
                            <th style={{ textAlign: "right" }}>Consumido</th>
                            <th style={{ textAlign: "right" }}>Fact. cant.</th>
                            <th style={{ textAlign: "right" }}>Facturado</th>
                            <th style={{ textAlign: "right" }}>Proyectado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(m.items).map(([k, it]) => {
                            const suf = conIva ? "con_iva" : "base";
                            const itr = it as unknown as Record<string, number>;
                            if (!itr[`presu_${suf}`] && !itr[`cons_${suf}`] && !itr[`fact_${suf}`]) return null;
                            return (
                              <tr key={k}>
                                <td>{ITEM_LABELS[k] ?? k}</td>
                                <td className="num" style={{ textAlign: "right" }}>{it.presu_qty || "—"}</td>
                                <td className="num" style={{ textAlign: "right" }}>{fmtShort(itr[`presu_${suf}`])}</td>
                                <td className="num" style={{ textAlign: "right" }}>{it.cons_qty || "—"}</td>
                                <td className="num" style={{ textAlign: "right" }}>{fmtShort(itr[`cons_${suf}`])}</td>
                                <td className="num" style={{ textAlign: "right" }}>{it.fact_qty || "—"}</td>
                                <td className="num" style={{ textAlign: "right" }}>{fmtShort(itr[`fact_${suf}`])}</td>
                                <td className="num" style={{ textAlign: "right" }}>{fmtShort(itr[`proj_${suf}`])}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type AaaTab = Tab;

/** Vista de Proyecto Triple A. `tab` viene de la ruta (/aaa/<seccion>): cada sección es un módulo interno. */
export function AaaClient({ data, prefacturas, demo, tab, maestros }: { data: CorteAaa; prefacturas: PrefacturaRow[]; demo: boolean; tab: Tab; maestros?: { areas: string[]; interventores: string[] } }) {
  const [conIva, setConIva] = useState(false);

  const cons = data.consolidado;
  const alq = data.contrato_alquiler;
  const eme = data.contrato_emergencia;
  const obj: ResumenFinanciero = tab === "consolidado" ? cons : tab === "alquiler" ? alq : eme;
  const rec = obj as unknown as Record<string, unknown>;

  return (
    <>
      <div className="filters-bar" style={{ marginTop: 0 }}>
        {tab !== "prefacturas" && (
          <div className="segmented">
            <button className={`seg${!conIva ? " active" : ""}`} onClick={() => setConIva(false)}>Sin IVA</button>
            <button className={`seg${conIva ? " active" : ""}`} onClick={() => setConIva(true)}>Con IVA</button>
          </div>
        )}
      </div>

      {tab === "prefacturas" && <PrefacturasClient initialRows={prefacturas} demo={demo} maestros={maestros} />}

      {tab === "alquiler" && (
        <div className="estado-panel">
          <div className="estado-item"><span className="estado-label">Contrato</span><span className="estado-val">{alq.numero}</span></div>
          <div className="estado-item"><span className="estado-label">Cliente</span><span className="estado-val">{alq.cliente}</span></div>
          <div className="estado-item"><span className="estado-label">Vigencia</span><span className="estado-val">{fdate(alq.fecha_inicio)} — {fdate(alq.fecha_fin)}</span></div>
          <div className="estado-item"><span className="estado-label">Valor firmado (con IVA)</span><span className="estado-val">{COP.format(alq.valor_oficial_firmado_con_iva)}</span></div>
          <div className="estado-item"><span className="estado-label">Corte facturado</span><span className="estado-val">{fdate(alq.fecha_corte_facturado)}</span></div>
          <div className="estado-item"><span className="estado-label">Corte prefactura</span><span className="estado-val">{fdate(alq.fecha_corte_prefactura)}</span></div>
        </div>
      )}
      {tab === "emergencia" && (
        <div className="estado-panel">
          <div className="estado-item"><span className="estado-label">Contrato</span><span className="estado-val">{eme.numero}</span></div>
          <div className="estado-item"><span className="estado-label">Cliente</span><span className="estado-val">{eme.cliente}</span></div>
          <div className="estado-item"><span className="estado-label">Vigencia</span><span className="estado-val">{fdate(eme.fecha_inicio)} — {fdate(eme.fecha_fin)}</span></div>
          <div className="estado-item">
            <span className="estado-label">Tiempo transcurrido</span>
            <span className="estado-val">{eme.dias_transcurridos} de {eme.dias_totales} días ({eme.pct_tiempo_transcurrido}%)</span>
            <span className="estado-sub">el proyectado al cierre se calcula por avance de tiempo</span>
          </div>
          <div className="estado-item"><span className="estado-label">Corte prefactura</span><span className="estado-val">{fdate(eme.fecha_corte_prefactura)}</span></div>
        </div>
      )}

      {tab !== "prefacturas" && (
        <>
          <div className="section-title">Resumen {tab === "consolidado" ? "consolidado (ambos contratos)" : tab === "alquiler" ? "del contrato de alquiler" : "del contrato de emergencia"}</div>
          <Kpis obj={obj} conIva={conIva} />

          <div className="section-title">Ejecución del presupuesto</div>
          <div className="chart-card">
            <Bar label="Consumido (costo interno AG)" value={v(rec, "consumido", conIva)} total={v(rec, "presupuesto", conIva)} />
            <Bar label="Facturado a Triple A" value={v(rec, "facturado", conIva)} total={v(rec, "presupuesto", conIva)} />
            <Bar label="Facturado + prefactura" value={v(rec, "facturado", conIva) + v(rec, "prefactura", conIva)} total={v(rec, "presupuesto", conIva)} />
            <Bar label="Proyectado al cierre" value={v(rec, "proyectado", conIva)} total={v(rec, "presupuesto", conIva)} />
          </div>
        </>
      )}

      {tab === "alquiler" && (
        <>
          <div className="section-title">Detalle por máquina — clic en una fila para ver sus ítems</div>
          <MaquinasTable machines={alq.machines} conIva={conIva} />
        </>
      )}

      {tab === "emergencia" && (
        <>
          <div className="section-title">Ítems consumidos del contrato de emergencia</div>
          <div className="table-wrap table-scroll">
            <table className="clean">
              <thead>
                <tr>
                  <th>Ítem</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th>Unidad</th>
                  <th style={{ textAlign: "right" }}>Tarifa prom.</th>
                  <th style={{ textAlign: "right" }}>Consumido</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(eme.items).map(([nombre, it]) => (
                  <tr key={nombre}>
                    <td><b>{nombre}</b></td>
                    <td className="num" style={{ textAlign: "right" }}>{it.qty.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</td>
                    <td className="muted">{it.unidad}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(it.rate)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(conIva ? it.cons_con_iva : it.cons_base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "consolidado" && (
        <>
          <div className="section-title">Costos indirectos AAA — {cons.fecha_corte_indirectos}</div>
          <div className="info-bar">
            <IconInfo />
            <div>
              Indirectos comunes a ambos contratos (no discriminados): se descuentan de la utilidad solo aquí, en el
              consolidado. La nómina se incluye manualmente en cada corte. Próximamente <b>ICA</b> y <b>Estampillas</b> quedarán
              como ítems separados dentro de Impuestos en Herpro.
            </div>
          </div>
          <div className="table-wrap table-scroll">
            <table className="clean">
              <thead>
                <tr>
                  <th>Ítem</th>
                  <th style={{ textAlign: "right" }}>Presupuesto</th>
                  <th style={{ textAlign: "right" }}>Consumido</th>
                  <th style={{ textAlign: "right" }}>Disponible</th>
                  <th style={{ width: 180 }}>Ejecución</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cons.indirectos_items).map(([nombre, it]) => {
                  const p = pct(it.consumido, it.presupuesto);
                  return (
                    <tr key={nombre}>
                      <td><b>{nombre}</b></td>
                      <td className="num" style={{ textAlign: "right" }}>{COP.format(it.presupuesto)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{COP.format(it.consumido)}</td>
                      <td className="num" style={{ textAlign: "right", color: it.presupuesto - it.consumido < 0 ? "var(--high)" : undefined }}>
                        {COP.format(it.presupuesto - it.consumido)}
                      </td>
                      <td>
                        <div className="bar-track" style={{ height: 14 }}>
                          <div className={`bar-fill${p >= 100 ? " full" : ""}`} style={{ width: `${Math.min(p, 100)}%`, background: p >= 100 ? "var(--high)" : undefined }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--surface-2)" }}>
                  <td><b>Total indirectos</b></td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{COP.format(cons.indirectos_presupuesto)}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{COP.format(cons.indirectos_consumido)}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{COP.format(cons.indirectos_presupuesto - cons.indirectos_consumido)}</td>
                  <td className="muted">{pct(cons.indirectos_consumido, cons.indirectos_presupuesto).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab !== "prefacturas" && (
        <>
          <div className="section-title">Impuestos y utilidad</div>
          <UtilPanel
            obj={obj}
            titulo={tab === "consolidado" ? "Consolidado" : tab === "alquiler" ? "Contrato Alquiler" : "Otro Sí / Emergencia"}
          />
        </>
      )}
    </>
  );
}
