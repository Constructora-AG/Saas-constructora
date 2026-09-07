import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// ════════════════════════════════════════════════════════════════════
// Gestión de cuentas de la plataforma — SOLO rol `gerencia`.
//   GET    → lista las cuentas (usuarios + fila de rol)
//   POST   → crea una cuenta   { email, nombre, rol, password }
//   PATCH  → actualiza { id, password? | rol? | nombre? }
//   DELETE → elimina la cuenta { id }  (nunca la propia)
// El middleware ya exige sesión; aquí además se verifica el rol gerencia
// leyendo la fila del solicitante con la service_role.
// ════════════════════════════════════════════════════════════════════

const ROLES = ["gerencia", "renzo", "jesus"] as const;

async function exigirGerencia(): Promise<{ uid: string } | NextResponse> {
  const ses = await supabaseServer();
  if (!ses) return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  const { data: { user } } = await ses.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data } = await supabaseAdmin().from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  if (data?.rol !== "gerencia") {
    return NextResponse.json({ error: "Solo Gerencia puede administrar cuentas" }, { status: 403 });
  }
  return { uid: user.id };
}

export async function GET() {
  const g = await exigirGerencia();
  if (g instanceof NextResponse) return g;
  const { data, error } = await supabaseAdmin()
    .from("usuarios")
    .select("id, email, nombre, rol, creado_en")
    .order("creado_en", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usuarios: data ?? [], yo: g.uid });
}

export async function POST(req: NextRequest) {
  const g = await exigirGerencia();
  if (g instanceof NextResponse) return g;

  let b: { email?: string; nombre?: string; rol?: string; password?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const email = b.email?.trim().toLowerCase();
  const nombre = b.nombre?.trim();
  const rol = b.rol as (typeof ROLES)[number];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  if (!b.password || b.password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    password: b.password,
    email_confirm: true, // las crea el admin: sin flujo de confirmación
    user_metadata: { nombre, rol },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: e2 } = await supa
    .from("usuarios")
    .upsert({ id: data.user.id, email, nombre, rol }, { onConflict: "id" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true, usuario: { id: data.user.id, email, nombre, rol } });
}

export async function PATCH(req: NextRequest) {
  const g = await exigirGerencia();
  if (g instanceof NextResponse) return g;

  // Actualiza cualquiera de: contraseña, rol, nombre. { id, password?, rol?, nombre? }
  let b: { id?: string; password?: string; rol?: string; nombre?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const supa = supabaseAdmin();
  const cambios: string[] = [];

  if (b.password !== undefined) {
    if (!b.password || b.password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    const { error } = await supa.auth.admin.updateUserById(b.id, { password: b.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    cambios.push("password");
  }

  const patch: { rol?: string; nombre?: string } = {};
  if (b.rol !== undefined) {
    const rol = b.rol as (typeof ROLES)[number];
    if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    if (b.id === g.uid && rol !== "gerencia") {
      return NextResponse.json({ error: "No puedes quitarte a ti mismo el rol de Gerencia" }, { status: 400 });
    }
    patch.rol = rol;
  }
  if (b.nombre !== undefined) {
    const nombre = b.nombre.trim();
    if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    patch.nombre = nombre;
  }
  if (Object.keys(patch).length) {
    const { error } = await supa.from("usuarios").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // refleja nombre/rol también en los metadatos de Auth (informativo)
    await supa.auth.admin.updateUserById(b.id, { user_metadata: patch }).catch(() => undefined);
    cambios.push(...Object.keys(patch));
  }
  if (!cambios.length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  return NextResponse.json({ ok: true, cambios });
}

export async function DELETE(req: NextRequest) {
  const g = await exigirGerencia();
  if (g instanceof NextResponse) return g;

  let b: { id?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (b.id === g.uid) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });

  // borra en auth.users; la fila de `usuarios` cae por on delete cascade
  const { error } = await supabaseAdmin().auth.admin.deleteUser(b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
