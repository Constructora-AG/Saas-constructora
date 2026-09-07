"use client";
// ════════════════════════════════════════════════════════════════════
// Usuarios de la plataforma (solo Gerencia)
// - Lista de cuentas (nombre, email, rol, fecha de alta).
// - Crear cuenta: nombre, email, rol, contraseña (con generador).
// - Por cuenta: cambiar rol (inline), editar nombre, restablecer
//   contraseña y eliminar (nunca la propia).
// Persistencia vía /api/usuarios (service_role en el servidor, que
// re-verifica que quien llama tenga rol gerencia).
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { useUsuario } from "@/lib/auth/useUsuario";
import { ROLES, ROL_LABELS, ROL_DESC, ROL_MODULOS, MODULOS_OTORGABLES, type RolPlataforma } from "@/lib/auth/modulos";

type Cuenta = { id: string; email: string; nombre: string; rol: string; modulos?: string[]; creado_en?: string };

function generarPassword(len = 12): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => abc[n % abc.length]).join("");
}

const fFecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function UsuariosClient() {
  const { usuario, cargando } = useUsuario();
  const esGerencia = usuario?.rol === "superadmin";

  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [yo, setYo] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", rol: "operacion" as RolPlataforma, password: generarPassword(), modulos: [] as string[] });
  const [modulosDe, setModulosDe] = useState<{ id: string; modulos: string[] } | null>(null);
  const [verPass, setVerPass] = useState(true);
  const [editNombre, setEditNombre] = useState<{ id: string; nombre: string } | null>(null);
  const [resetPass, setResetPass] = useState<{ id: string; password: string } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/usuarios", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "No se pudieron cargar las cuentas.");
    setCuentas(j.usuarios);
    setYo(j.yo ?? null);
  }, []);

  useEffect(() => {
    if (!esGerencia) return;
    cargar().catch((e) => setMsg({ error: e instanceof Error ? e.message : "Error cargando cuentas." }));
  }, [esGerencia, cargar]);

  const llamar = async (id: string, init: RequestInit, okMsg: string) => {
    setMsg(null);
    setOcupado(id);
    try {
      const r = await fetch("/api/usuarios", { headers: { "Content-Type": "application/json" }, ...init });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "La operación falló.");
      setMsg({ ok: okMsg });
      await cargar();
      return true;
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "La operación falló." });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await llamar("nuevo", { method: "POST", body: JSON.stringify(nuevo) },
      `Cuenta ${nuevo.email} creada con rol ${ROL_LABELS[nuevo.rol]}. Contraseña: ${nuevo.password} — cópiala ahora, no se vuelve a mostrar.`);
    if (ok) setNuevo({ nombre: "", email: "", rol: "operacion", password: generarPassword(), modulos: [] });
  };

  const cambiarRol = (c: Cuenta, rol: string) =>
    llamar(c.id, { method: "PATCH", body: JSON.stringify({ id: c.id, rol }) }, `${c.nombre}: rol cambiado a ${ROL_LABELS[rol as RolPlataforma] ?? rol}.`);

  const guardarNombre = async () => {
    if (!editNombre) return;
    const ok = await llamar(editNombre.id, { method: "PATCH", body: JSON.stringify({ id: editNombre.id, nombre: editNombre.nombre }) }, "Nombre actualizado.");
    if (ok) setEditNombre(null);
  };

  const guardarModulos = async () => {
    if (!modulosDe) return;
    const ok = await llamar(modulosDe.id, { method: "PATCH", body: JSON.stringify({ id: modulosDe.id, modulos: modulosDe.modulos }) }, "Accesos a módulos actualizados.");
    if (ok) setModulosDe(null);
  };

  const guardarPass = async () => {
    if (!resetPass) return;
    const ok = await llamar(resetPass.id, { method: "PATCH", body: JSON.stringify({ id: resetPass.id, password: resetPass.password }) },
      `Contraseña restablecida: ${resetPass.password} — cópiala ahora, no se vuelve a mostrar.`);
    if (ok) setResetPass(null);
  };

  const eliminar = async (c: Cuenta) => {
    if (!window.confirm(`¿Eliminar la cuenta de ${c.nombre} (${c.email})? Perderá el acceso de inmediato.`)) return;
    await llamar(c.id, { method: "DELETE", body: JSON.stringify({ id: c.id }) }, `Cuenta ${c.email} eliminada.`);
  };

  if (cargando) return <div className="table-wrap" style={{ padding: 18 }}><span className="muted">Cargando sesión…</span></div>;
  if (!esGerencia) {
    return (
      <div className="table-wrap" style={{ padding: 18 }}>
        <b>Acceso restringido.</b> <span className="muted">Solo el Super admin puede administrar usuarios.</span>
      </div>
    );
  }

  return (
    <>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Usuarios de la plataforma</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5, textTransform: "none", letterSpacing: 0 }}>
          {cuentas ? `${cuentas.length} cuenta(s)` : ""}
        </span>
      </div>

      {msg?.error && <div style={{ color: "var(--high)", fontSize: 13, margin: "0 0 10px" }}>{msg.error}</div>}
      {msg?.ok && (
        <div className="info-bar" style={{ marginBottom: 12 }}>
          <div>{msg.ok}</div>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>Cerrar</button>
        </div>
      )}

      {/* Crear cuenta */}
      <form className="table-wrap" style={{ padding: 18, marginBottom: 18 }} onSubmit={(e) => void crear(e)}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Nueva cuenta</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          La cuenta queda activa de inmediato (sin correo de confirmación). Entrega la contraseña al usuario por un canal seguro.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label className="field">Nombre
            <input className="input" required value={nuevo.nombre} onChange={(e) => setNuevo((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre y apellido" />
          </label>
          <label className="field">Email
            <input className="input" type="email" required value={nuevo.email} onChange={(e) => setNuevo((f) => ({ ...f, email: e.target.value }))} placeholder="nombre@agconstructora.com.co" />
          </label>
          <label className="field">Rol
            <select className="input" value={nuevo.rol} onChange={(e) => setNuevo((f) => ({ ...f, rol: e.target.value as RolPlataforma }))}>
              {ROLES.map((r) => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{ROL_DESC[nuevo.rol]}</span>
          </label>
          <label className="field">Contraseña (mín. 8)
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" type={verPass ? "text" : "password"} required minLength={8} value={nuevo.password}
                onChange={(e) => setNuevo((f) => ({ ...f, password: e.target.value }))} style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerPass((v) => !v)} title={verPass ? "Ocultar" : "Mostrar"}>{verPass ? "Ocultar" : "Ver"}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevo((f) => ({ ...f, password: generarPassword() }))} title="Generar contraseña">Generar</button>
            </div>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Módulos adicionales <span className="muted" style={{ fontWeight: 400 }}>(además de los que ya incluye el rol)</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {MODULOS_OTORGABLES.map((m) => {
              const incluido = ROL_MODULOS[nuevo.rol].includes(m.id) || nuevo.rol === "superadmin";
              const marcado = incluido || nuevo.modulos.includes(m.id);
              return (
                <label key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: incluido ? "var(--muted)" : "var(--text)" }} title={incluido ? "Incluido en el rol" : "Otorgar acceso"}>
                  <input type="checkbox" checked={marcado} disabled={incluido}
                    onChange={(e) => setNuevo((f) => ({ ...f, modulos: e.target.checked ? [...f.modulos, m.id] : f.modulos.filter((x) => x !== m.id) }))} />
                  {m.label} <span className="muted" style={{ fontSize: 11 }}>· {m.seccion}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={ocupado === "nuevo"}>{ocupado === "nuevo" ? "Creando…" : "+ Crear cuenta"}</button>
        </div>
      </form>

      {/* Lista */}
      <div className="table-wrap">
        <table className="clean" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Módulos</th>
              <th>Alta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cuentas === null && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>Cargando cuentas…</td></tr>}
            {cuentas?.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>No hay cuentas.</td></tr>}
            {cuentas?.map((c) => {
              const esYo = c.id === yo;
              const busy = ocupado === c.id;
              return (
                <tr key={c.id}>
                  <td>
                    {editNombre?.id === c.id ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input className="input" value={editNombre.nombre} onChange={(e) => setEditNombre({ id: c.id, nombre: e.target.value })} style={{ width: 200 }} autoFocus />
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void guardarNombre()}>Guardar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditNombre(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <>
                        <b>{c.nombre}</b>{esYo && <span className="badge ok" style={{ marginLeft: 8 }}>tú</span>}
                      </>
                    )}
                  </td>
                  <td className="muted">{c.email}</td>
                  <td>
                    <select className="input" value={c.rol} disabled={busy || esYo} title={esYo ? "No puedes cambiar tu propio rol" : "Asignar rol"}
                      onChange={(e) => void cambiarRol(c, e.target.value)} style={{ minWidth: 130 }}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    {modulosDe?.id === c.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {MODULOS_OTORGABLES.map((m) => {
                          const incluido = c.rol === "superadmin" || (ROL_MODULOS[c.rol as RolPlataforma] ?? []).includes(m.id);
                          return (
                            <label key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: incluido ? "var(--muted)" : "var(--text)" }}>
                              <input type="checkbox" checked={incluido || modulosDe.modulos.includes(m.id)} disabled={incluido}
                                onChange={(e) => setModulosDe({ id: c.id, modulos: e.target.checked ? [...modulosDe.modulos, m.id] : modulosDe.modulos.filter((x) => x !== m.id) })} />
                              {m.label}
                            </label>
                          );
                        })}
                        <span style={{ display: "inline-flex", gap: 6, marginTop: 4 }}>
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void guardarModulos()}>Guardar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModulosDe(null)}>Cancelar</button>
                        </span>
                      </div>
                    ) : c.rol === "superadmin" ? (
                      <span className="muted" style={{ fontSize: 12.5 }}>Todos</span>
                    ) : (
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {(ROL_MODULOS[c.rol as RolPlataforma] ?? []).map((id) => <span key={id} className="badge" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{MODULOS_OTORGABLES.find((m) => m.id === id)?.label ?? id}</span>)}
                        {(c.modulos ?? []).filter((id) => !(ROL_MODULOS[c.rol as RolPlataforma] ?? []).includes(id)).map((id) => <span key={id} className="badge ok" title="Acceso adicional">{MODULOS_OTORGABLES.find((m) => m.id === id)?.label ?? id} +</span>)}
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setModulosDe({ id: c.id, modulos: c.modulos ?? [] })} title="Otorgar o quitar módulos adicionales">Editar</button>
                      </span>
                    )}
                  </td>
                  <td className="muted">{fFecha(c.creado_en)}</td>
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    {resetPass?.id === c.id ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input className="input" value={resetPass.password} onChange={(e) => setResetPass({ id: c.id, password: e.target.value })} style={{ width: 160 }} />
                        <button className="btn btn-primary btn-sm" disabled={busy || resetPass.password.length < 8} onClick={() => void guardarPass()}>Aplicar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setResetPass(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditNombre({ id: c.id, nombre: c.nombre })}>Nombre</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setResetPass({ id: c.id, password: generarPassword() })}>Contraseña</button>
                        {!esYo && (
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} disabled={busy} onClick={() => void eliminar(c)}>Eliminar</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
