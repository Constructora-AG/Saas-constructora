import { bi, rest, SmarthomeError } from "@/lib/smarthome/client";
import type { ProjectSummaryRecord } from "@/lib/smarthome/types";
import { PROJECTS } from "@/lib/smarthome/projects";
import { IconBuilding, IconKey, IconHome, IconCoins, IconAlert } from "./icons";

const ALLOWED = new Set(PROJECTS.map((p) => p.name.toLowerCase()));

export const dynamic = "force-dynamic";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

interface ProjectKpi {
  project: string;
  units: number;
  sold: number;
  available: number;
  pipelineValue: number;
}

function aggregate(records: ProjectSummaryRecord[]): ProjectKpi[] {
  const map = new Map<string, ProjectKpi>();
  for (const r of records) {
    const k = r.project;
    const cur = map.get(k) ?? { project: k, units: 0, sold: 0, available: 0, pipelineValue: 0 };
    cur.units += 1;
    if (r.moduleStatus === 1) cur.available += 1;
    else cur.sold += 1;
    cur.pipelineValue += r.totalValue ?? 0;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.pipelineValue - a.pipelineValue);
}

export default async function Dashboard() {
  let kpis: ProjectKpi[] = [];
  let error: string | null = null;

  try {
    kpis = aggregate((await bi.projectSummary()).filter((r) => ALLOWED.has((r.project ?? "").trim().toLowerCase())));
  } catch (err) {
    error = err instanceof SmarthomeError ? `${err.message} — ¿UserKey expirada? Regenérala en el portal.` : String(err);
  }

  const totUnits = kpis.reduce((s, k) => s + k.units, 0);
  const totSold = kpis.reduce((s, k) => s + k.sold, 0);
  const totValue = kpis.reduce((s, k) => s + k.pipelineValue, 0);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Resumen general</h1>
        <p className="page-sub">Ventas e inventario consolidado de los proyectos, con datos en vivo de Smarthome.</p>
      </div>

      {error ? (
        <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
          <IconAlert />
          <div>
            <b>No se pudieron cargar los datos de Smarthome.</b>
            <div style={{ marginTop: 2 }}>{error}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-head">
                <span className="kpi-ico"><IconBuilding /></span>
                <span className="kpi-label">Proyectos activos</span>
              </div>
              <div className="kpi-value">{kpis.length}</div>
            </div>
            <div className="kpi">
              <div className="kpi-head">
                <span className="kpi-ico s-ok"><IconKey /></span>
                <span className="kpi-label">Unidades vendidas</span>
              </div>
              <div className="kpi-value">{totSold}</div>
              <div className="kpi-foot">de {totUnits} unidades en total</div>
            </div>
            <div className="kpi">
              <div className="kpi-head">
                <span className="kpi-ico s-warn"><IconHome /></span>
                <span className="kpi-label">Disponibles</span>
              </div>
              <div className="kpi-value">{totUnits - totSold}</div>
              <div className="kpi-foot">en inventario</div>
            </div>
            <div className="kpi">
              <div className="kpi-head">
                <span className="kpi-ico"><IconCoins /></span>
                <span className="kpi-label">Valor en cartera</span>
              </div>
              <div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(totValue)}</div>
            </div>
          </div>

          <div className="section-title">Detalle por proyecto</div>
          <div className="table-wrap">
            <table className="clean">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Vendidas</th>
                  <th>Disponibles</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.project}>
                    <td><b>{k.project}</b></td>
                    <td><span className="badge ok">{k.sold} vendidas</span></td>
                    <td className="muted">{k.available} disponibles</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(k.pipelineValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
