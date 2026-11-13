import { NextResponse } from "next/server";
import { esRol, puedeVer, type RolPlataforma } from "@/lib/auth/modulos";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export interface UsuarioServidor {
  id: string;
  email: string;
  nombre: string;
  rol: RolPlataforma;
  modulos: string[];
}

const USUARIO_DEMO: UsuarioServidor = {
  id: "demo",
  email: "demo@agconstructora.com.co",
  nombre: "Super admin (demo)",
  rol: "superadmin",
  modulos: [],
};

/** Obtiene la identidad y los permisos desde el servidor, nunca desde el cliente. */
export async function usuarioServidor(): Promise<UsuarioServidor | null> {
  const ses = await supabaseServer();
  if (!ses) return USUARIO_DEMO;

  const { data: auth } = await ses.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabaseAdmin()
    .from("usuarios")
    .select("id, email, nombre, rol, modulos")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data || !esRol(data.rol)) return null;

  return {
    id: data.id as string,
    email: (data.email as string) || auth.user.email || "",
    nombre: (data.nombre as string) || (data.email as string) || auth.user.email || "Usuario",
    rol: data.rol,
    modulos: Array.isArray(data.modulos) ? data.modulos.filter((v): v is string => typeof v === "string") : [],
  };
}

export async function exigirModulo(modulo: string): Promise<UsuarioServidor | NextResponse> {
  const usuario = await usuarioServidor();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeVer(usuario, modulo)) return NextResponse.json({ error: "No autorizado para este módulo" }, { status: 403 });
  return usuario;
}

export async function exigirCualquieraDeModulos(modulos: string[]): Promise<UsuarioServidor | NextResponse> {
  const usuario = await usuarioServidor();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!modulos.some((modulo) => puedeVer(usuario, modulo))) {
    return NextResponse.json({ error: "No autorizado para este módulo" }, { status: 403 });
  }
  return usuario;
}

export async function exigirRol(rol: RolPlataforma): Promise<UsuarioServidor | NextResponse> {
  const usuario = await usuarioServidor();
  if (!usuario) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (usuario.rol !== rol) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  return usuario;
}

export function esRespuestaAutorizacion(value: UsuarioServidor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
