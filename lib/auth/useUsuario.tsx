"use client";
// ════════════════════════════════════════════════════════════════════
// Sesión de plataforma — usuario logueado (Supabase Auth + tabla `usuarios`).
// Un solo Provider en el layout raíz; `useUsuario()` en cualquier client
// component. Del ROL del usuario (superadmin/operacion/comercial/finanzas)
// más sus módulos extra sale qué ve cada quien (lib/auth/modulos.ts).
// Modo demo (Supabase sin configurar, lib/demo.supabaseConfigured):
// devuelve un usuario ficticio superadmin para no romper desarrollo.
// ════════════════════════════════════════════════════════════════════

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session, UserResponse } from "@supabase/supabase-js";

import { esRol, ROL_LABELS, type RolPlataforma } from "@/lib/auth/modulos";
export { ROL_LABELS };
export type { RolPlataforma };

export interface UsuarioPlataforma {
  id: string;
  email: string;
  nombre: string;
  rol: RolPlataforma;
  /** Módulos extra otorgados por el super admin (ids de lib/auth/modulos). */
  modulos: string[];
}

const USUARIO_DEMO: UsuarioPlataforma = {
  id: "demo",
  email: "demo@agconstructora.com.co",
  nombre: "Super admin (demo)",
  rol: "superadmin",
  modulos: [],
};

interface UsuarioCtx {
  usuario: UsuarioPlataforma | null;
  cargando: boolean;
  cerrarSesion: () => Promise<void>;
}

const Ctx = createContext<UsuarioCtx | null>(null);

export function UsuarioProvider({ children }: { children: ReactNode }) {
  const supa = supabaseBrowser(); // null → modo demo
  const [usuario, setUsuario] = useState<UsuarioPlataforma | null>(supa ? null : USUARIO_DEMO);
  const [cargando, setCargando] = useState<boolean>(Boolean(supa));

  useEffect(() => {
    if (!supa) return; // demo: usuario fijo, nada que cargar
    let vivo = true;

    const cargar = async (userId: string | null, email: string | null) => {
      if (!userId) {
        if (vivo) { setUsuario(null); setCargando(false); }
        return;
      }
      const { data } = await supa.from("usuarios").select("id, email, nombre, rol, modulos").eq("id", userId).maybeSingle();
      if (!vivo) return;
      const rolRaw = data?.rol;
      const rol = esRol(rolRaw) ? rolRaw : null;
      setUsuario(
        rol
          ? {
              id: userId,
              email: (data?.email as string) || email || "",
              nombre: (data?.nombre as string) || (data?.email as string) || email || "Usuario",
              rol,
              modulos: Array.isArray(data?.modulos) ? (data!.modulos as string[]) : [],
            }
          : null, // sin fila en `usuarios` → sin rol: no se le concede nada
      );
      setCargando(false);
    };

    supa.auth.getUser().then(({ data }: UserResponse) => cargar(data.user?.id ?? null, data.user?.email ?? null));
    const { data: sub } = supa.auth.onAuthStateChange((_ev: AuthChangeEvent, session: Session | null) => {
      cargar(session?.user?.id ?? null, session?.user?.email ?? null);
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [supa]);

  const cerrarSesion = useCallback(async () => {
    if (supa) await supa.auth.signOut();
    window.location.href = "/login";
  }, [supa]);

  const value = useMemo<UsuarioCtx>(() => ({ usuario, cargando, cerrarSesion }), [usuario, cargando, cerrarSesion]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUsuario(): UsuarioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUsuario debe usarse dentro de <UsuarioProvider>.");
  return ctx;
}
