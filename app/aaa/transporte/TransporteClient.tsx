"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Shell del módulo (pestañas + vistas)
//
// CONTRATO PARA LOS CONSTRUCTORES DE VISTAS
// ─────────────────────────────────────────
// Cada vista es un client component en este directorio que recibe SIEMPRE
// `{ t }: ViewProps` (ViewProps viene de "@/lib/transporte/useTransporte"):
//
//   t.admin / t.tarifario / t.months / t.servicesByMonth   — datos vivos
//   t.activeMonthIdx / setActiveMonthIdx / activeMonth / activeServices
//   t.status / t.contractStart / t.contractEndExclusive    — vigencia
//   t.upsertService / deleteService / toggleInvoiced / markInvoiced
//   t.saveTarifarioCfg / resetTarifario / saveAdminCfg
//   t.downloadBackup / restoreFromBackup / refresh
//   t.setModalOpen(true|false)  ← OBLIGATORIO al abrir/cerrar cualquier
//                                 modal o drawer (pausa el polling de 12 s)
//   t.demo / loading / error / saving / lastSyncAt
//
// Decisión AG: identidad por login de plataforma (Supabase Auth) —
// session.tsx consume el ROL de la sesión (stub provisional "gerencia").
// Sin claves ni selectores. Guardar un servicio sella con el rol activo:
//   const r = ses.approve();
//   item = { ...item, ...r.stamp }; await t.upsertService(mesKey, item);
//
// Reparto de vistas (props idénticas en todas: { t }):
//   ResumenView    — KPIs, línea de tiempo, ejecución mensual (divs CSS, sin
//                    Chart.js), alertas (computeAlertas), export global.
//   RegistrosView  — pestañas por mes, tabla de servicios, formulario/modal de
//                    registro (autoRecargos + computeValor + media.ts),
//                    export mensual, orden de servicio PDF (pdf-lib).
//   TarifarioView  — edición del tarifario (saveTarifarioCfg / resetTarifario).
//   ReportesView   — 12 filtros, stats, heatmap, export (xlsx / pdf-lib).
//   FlotaView      — catálogo de vehículos (permiso 'vehiculos').
//   PersonalView   — catálogo de personal (permiso 'personal').
//   AdminView      — listas maestras, permisos, contrato, backup
//                    (secciones exclusivas de gerencia, OCULTAS para los
//                    demás perfiles — aislamiento por rol, sin claves).
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { IconInfo } from "../../icons";
import { useTransporte, syncLabel, type UseTransporte } from "@/lib/transporte/useTransporte";
import { TransporteSessionProvider, useTransporteSession } from "@/lib/transporte/session";
import { AdminView } from "./AdminView";
import { FlotaView } from "./FlotaView";
import { PersonalView } from "./PersonalView";
import { RegistrosView } from "./RegistrosView";
import { ReportesView } from "./ReportesView";
import { ResumenView } from "./ResumenView";
import { TarifarioView } from "./TarifarioView";

type Tab = "resumen" | "registros" | "tarifario" | "reportes" | "flota" | "personal" | "admin";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "registros", label: "Registros" },
  { id: "tarifario", label: "Tarifario" },
  { id: "reportes", label: "Reportes" },
  { id: "flota", label: "Flota" },
  { id: "personal", label: "Personal" },
  { id: "admin", label: "Administración" },
];

export function TransporteClient() {
  const t = useTransporte();
  return (
    <TransporteSessionProvider admin={t.admin}>
      <TransporteShell t={t} />
    </TransporteSessionProvider>
  );
}

function TransporteShell({ t }: { t: UseTransporte }) {
  const ses = useTransporteSession();
  const [tab, setTab] = useState<Tab>("resumen");

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Control Transporte AAA</h1>
        <p className="page-sub">
          Contrato IS No. 04-2026 — transporte de equipos y maquinaria Triple A / Anaya Giraldo:
          registro de servicios, tarifario del pliego, reportes y avance del contrato.
        </p>
      </div>

      {t.error ? (
        <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
          <IconInfo />
          <div><b>No se pudieron cargar los datos.</b> {t.error}</div>
        </div>
      ) : (
        <div className="info-bar">
          <IconInfo />
          <div>
            <b>Panel compartido</b> — visible y editable por todo el equipo. {t.status.label} · {syncLabel(t)}
            {t.demo && <> · Sin Supabase configurado: los cambios no se guardan.</>}
          </div>
        </div>
      )}

      <div className="filters-bar" style={{ marginTop: 0 }}>
        <div className="segmented">
          {TABS.map((x) => (
            <button key={x.id} className={`seg${tab === x.id ? " active" : ""}`} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void t.refresh()} disabled={t.loading}>
          Actualizar
        </button>
      </div>

      {t.loading ? (
        <div className="table-wrap" style={{ padding: 18 }}>
          <span className="muted">Cargando datos guardados…</span>
        </div>
      ) : (
        <>
          {tab === "resumen" && <ResumenView t={t} />}
          {tab === "registros" && <RegistrosView t={t} />}
          {tab === "tarifario" && <TarifarioView t={t} />}
          {tab === "reportes" && <ReportesView t={t} />}
          {tab === "flota" && <FlotaView t={t} />}
          {tab === "personal" && <PersonalView t={t} />}
          {tab === "admin" && <AdminView t={t} />}
        </>
      )}
    </>
  );
}
