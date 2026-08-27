"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Sesión de perfiles (gerencia / renzo / jesus)
//
// Decisión AG: identidad por login de plataforma (Supabase Auth).
// Este módulo NO pide claves ni muestra selectores: `currentProfile`
// DERIVA del rol del usuario logueado en la plataforma (useUsuario:
// página /login + middleware + tabla `usuarios` con rol gerencia/renzo/
// jesus). En modo demo (Supabase sin configurar) el usuario demo es
// gerencia. approve() sella con el NOMBRE real del usuario logueado.
//
// El aislamiento por rol ya está cableado en las vistas con esta API:
// - profileCan(sec): gerencia = todo; renzo/jesus según su matriz `perms`
//   de adminconfig (secciones exclusivas de gerencia se OCULTAN; Flota y
//   Personal quedan en solo lectura sin permiso).
// - approve(): estampa { approvedBy, approvedByKey, approvedAt } con el
//   perfil activo, sin clave.
// `currentProfile` ya sale de la sesión real: todo el aislamiento está
// activo sin tocar las vistas. El campo `password` de los perfiles
// persiste en los datos por compatibilidad, pero nada lo usa ni muestra.
// ════════════════════════════════════════════════════════════════════

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useUsuario } from "@/lib/auth/useUsuario";
import type { AdminConfig, PerfilKey, PermKey } from "./model";

export const PERFIL_KEYS: PerfilKey[] = ["gerencia", "renzo", "jesus"];

export interface ApprovalStamp {
  approvedBy: string;      // label del perfil ('Gerencia' | 'Renzo' | 'Jesús')
  approvedByKey: PerfilKey;
  approvedAt: string;      // ISO
}

export interface TransporteSession {
  /** Rol del usuario logueado en la plataforma (useUsuario). */
  currentProfile: PerfilKey;
  /** Permiso por sección: gerencia = todo; renzo/jesus según perms. */
  profileCan: (sec: PermKey) => boolean;
  /** Permiso por sección para un perfil explícito (no el de la sesión). */
  profileCanFor: (perfil: PerfilKey | null, sec: PermKey) => boolean;
  /** ¿Puede editar Flota? (gerencia o permiso 'vehiculos'). */
  canEditFleet: () => boolean;
  /** ¿Puede editar Personal? (gerencia o permiso 'personal'). */
  canEditPersonal: () => boolean;
  /** Sello de registro de servicio con el perfil activo (sin clave). */
  approve: () => { stamp: ApprovalStamp };
  /** Labels de los perfiles según adminconfig. */
  profileLabel: (k: PerfilKey) => string;
}

const Ctx = createContext<TransporteSession | null>(null);

export function TransporteSessionProvider({ admin, children }: { admin: AdminConfig | null; children: ReactNode }) {
  // Rol de la sesión de plataforma (Supabase Auth + tabla `usuarios`).
  // Mientras carga (o si la cuenta no tiene fila en `usuarios`) se asume
  // "jesus" como perfil de MÍNIMO privilegio (sus permisos salen de la
  // matriz `perms` de adminconfig; nunca se asume gerencia por defecto).
  const { usuario } = useUsuario();
  const currentProfile: PerfilKey = usuario?.rol ?? "jesus";

  const profileLabel = useCallback(
    (k: PerfilKey) => admin?.profiles[k]?.label ?? (k === "gerencia" ? "Gerencia" : k === "renzo" ? "Renzo" : "Jesús"),
    [admin],
  );

  const profileCanFor = useCallback(
    (perfil: PerfilKey | null, sec: PermKey): boolean => {
      if (perfil === "gerencia") return true;
      if (!perfil) return false;
      return !!admin?.profiles[perfil]?.perms?.[sec];
    },
    [admin],
  );

  const profileCan = useCallback(
    (sec: PermKey): boolean => profileCanFor(currentProfile, sec),
    [profileCanFor, currentProfile],
  );

  const approve = useCallback(
    (): { stamp: ApprovalStamp } => ({
      stamp: {
        // Nombre real del usuario logueado; label del perfil como respaldo.
        approvedBy: usuario?.nombre || profileLabel(currentProfile),
        approvedByKey: currentProfile,
        approvedAt: new Date().toISOString(),
      },
    }),
    [usuario, currentProfile, profileLabel],
  );

  const value = useMemo<TransporteSession>(
    () => ({
      currentProfile,
      profileCan,
      profileCanFor,
      canEditFleet: () => currentProfile === "gerencia" || profileCan("vehiculos"),
      canEditPersonal: () => currentProfile === "gerencia" || profileCan("personal"),
      approve,
      profileLabel,
    }),
    [currentProfile, profileCan, profileCanFor, approve, profileLabel],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTransporteSession(): TransporteSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTransporteSession debe usarse dentro de <TransporteSessionProvider>.");
  return ctx;
}
