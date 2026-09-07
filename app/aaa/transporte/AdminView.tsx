"use client";
// ════════════════════════════════════════════════════════════════════
// Vista Administración — SPEC §5.7 con la Decisión AG: autenticación
// delegada a la plataforma (sin claves). El aislamiento es por ROL según
// la matriz `perms` de adminconfig: gerencia ve todo; renzo/jesus solo
// las secciones habilitadas (interventores, áreas, equipos, festivos…).
// Exclusivas de gerencia (OCULTAS para los demás): vigencia del contrato,
// matriz de permisos y copia de seguridad (validación via validateBackup
// de storage.ts). Ya no existen secciones de claves/seguridad.
// Nota: el alta rápida de vehículos del panel original vive en la vista Flota.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import type { PerfilKey, PermKey } from "@/lib/transporte/model";
import { num } from "@/lib/transporte/model";
import { validateBackup } from "@/lib/transporte/storage";
import { FESTIVOS_DEFAULT, PERM_KEYS, PERM_LABELS, allFestivos } from "@/lib/transporte/constants";
import { fdate } from "@/lib/transporte/logic";
import { useTransporteSession } from "@/lib/transporte/session";
import { Chip, MsgInline } from "./CatalogoTabla";

const PERFILES_CON_PERMISOS: PerfilKey[] = ["renzo", "jesus"];

// ── Cuentas de la plataforma (solo gerencia) ───────────────────────
// Alta/baja de cuentas de Supabase Auth vía /api/usuarios (service_role
// en el servidor; la ruta re-verifica el rol gerencia del solicitante).

type CuentaPlataforma = { id: string; email: string; nombre: string; rol: string; creado_en?: string };

const ROL_LABELS: Record<string, string> = { gerencia: "Gerencia", renzo: "Renzo", jesus: "Jesús" };

function generarPassword(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

function CuentasSeccion() {
  const [cuentas, setCuentas] = useState<CuentaPlataforma[] | null>(null);
  const [yo, setYo] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState({ email: "", nombre: "", rol: "renzo", password: "" });

  const cargar = async () => {
    const r = await fetch("/api/usuarios");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudieron cargar las cuentas.");
    setCuentas(j.usuarios);
    setYo(j.yo);
  };
  useEffect(() => {
    cargar().catch((e) => setMsg({ error: e instanceof Error ? e.message : "Error cargando cuentas." }));
  }, []);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setMsg({});
    setGuardando(true);
    try {
      const r = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo crear la cuenta.");
      setMsg({ ok: `Cuenta ${nuevo.email} creada (${ROL_LABELS[nuevo.rol] ?? nuevo.rol}). Contraseña: ${nuevo.password} — cópiala ahora, no se vuelve a mostrar.` });
      setNuevo({ email: "", nombre: "", rol: "renzo", password: "" });
      await cargar();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "No se pudo crear la cuenta." });
    } finally {
      setGuardando(false);
    }
  };

  const resetPassword = async (c: CuentaPlataforma) => {
    const pass = generarPassword();
    if (!window.confirm(`¿Asignar una contraseña nueva a ${c.email}? Se mostrará una sola vez.`)) return;
    setMsg({});
    setGuardando(true);
    try {
      const r = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, password: pass }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cambiar la contraseña.");
      setMsg({ ok: `Contraseña nueva de ${c.email}: ${pass} — cópiala ahora.` });
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "No se pudo cambiar la contraseña." });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c: CuentaPlataforma) => {
    if (!window.confirm(`¿Eliminar la cuenta ${c.email}? Esta acción no se puede deshacer.`)) return;
    setMsg({});
    setGuardando(true);
    try {
      const r = await fetch("/api/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo eliminar la cuenta.");
      setMsg({ ok: `Cuenta ${c.email} eliminada.` });
      await cargar();
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : "No se pudo eliminar la cuenta." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Seccion
      titulo="Cuentas de la plataforma"
      sub="Cuentas de acceso (email + contraseña). Gerencia = administrador total; Renzo y Jesús usan la matriz de permisos."
    >
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {cuentas === null && <span className="muted" style={{ fontSize: 13 }}>Cargando cuentas…</span>}
        {cuentas?.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, flex: 1 }}>
              <b>{c.nombre}</b>
              <span className="cc-dias">{c.email} · {ROL_LABELS[c.rol] ?? c.rol}{c.id === yo ? " · tú" : ""}</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => void resetPassword(c)} disabled={guardando} title="Generar contraseña nueva">
              Nueva clave
            </button>
            {c.id !== yo && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void eliminar(c)} disabled={guardando}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={crear} style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <input className="input" type="email" required placeholder="Email *" value={nuevo.email} onChange={(e) => setNuevo((f) => ({ ...f, email: e.target.value }))} />
          <input className="input" required placeholder="Nombre *" value={nuevo.nombre} onChange={(e) => setNuevo((f) => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "140px 1fr auto auto" }}>
          <select className="input" value={nuevo.rol} onChange={(e) => setNuevo((f) => ({ ...f, rol: e.target.value }))}>
            <option value="renzo">Renzo</option>
            <option value="jesus">Jesús</option>
            <option value="gerencia">Gerencia</option>
          </select>
          <input className="input" required minLength={8} placeholder="Contraseña (mín. 8) *" value={nuevo.password} onChange={(e) => setNuevo((f) => ({ ...f, password: e.target.value }))} />
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNuevo((f) => ({ ...f, password: generarPassword() }))}>
            Generar
          </button>
          <button className="btn btn-primary btn-sm" type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Crear cuenta"}
          </button>
        </div>
      </form>
      <div style={{ marginTop: 8 }}>
        <MsgInline error={msg.error} ok={msg.ok} />
      </div>
    </Seccion>
  );
}

// ── Tarjeta de sección con mensajes propios ────────────────────────

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="table-wrap" style={{ padding: 18 }}>
      <h3 style={{ margin: "0 0 2px", fontSize: 14.5 }}>{titulo}</h3>
      {sub && <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

// ── Lista maestra simple (interventores / áreas) ───────────────────

function ListaMaestra({
  items,
  placeholder,
  dupMsg,
  onAdd,
  onRemove,
  saving,
}: {
  items: string[];
  placeholder: string;
  dupMsg: string;
  onAdd: (v: string) => Promise<void>;
  onRemove: (v: string) => Promise<void>;
  saving: boolean;
}) {
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = nuevo.trim();
    if (!v) return;
    if (items.includes(v)) { setError(dupMsg); return; }
    try {
      await onAdd(v);
      setNuevo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Lista vacía.</span>}
        {items.map((x) => (
          <Chip key={x} onRemove={() => void onRemove(x).catch(() => undefined)}>{x}</Chip>
        ))}
      </div>
      <form onSubmit={agregar} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input className="input" placeholder={placeholder} value={nuevo} onChange={(e) => setNuevo(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={saving}>Agregar</button>
      </form>
      <MsgInline error={error} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════

export function AdminView({ t }: ViewProps) {
  const ses = useTransporteSession();

  // Mensajes por sección (inline, sin toasts)
  const [msgEquipos, setMsgEquipos] = useState<{ error?: string | null; ok?: string | null }>({});
  const [msgFestivos, setMsgFestivos] = useState<{ error?: string | null; ok?: string | null }>({});
  const [msgContrato, setMsgContrato] = useState<{ error?: string | null; ok?: string | null }>({});
  const [msgPermisos, setMsgPermisos] = useState<{ error?: string | null; ok?: string | null }>({});
  const [msgBackup, setMsgBackup] = useState<{ error?: string | null; ok?: string | null }>({});

  // Formularios locales
  const [eqNuevo, setEqNuevo] = useState({ name: "", weight: "", clase: "" });
  const [festNuevo, setFestNuevo] = useState({ date: "", label: "" });
  const [contrato, setContrato] = useState({ inicio: "", fin: "" });
  const [restaurando, setRestaurando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fechas de vigencia desde adminconfig
  useEffect(() => {
    if (t.admin) setContrato({ inicio: t.admin.contractStart || "", fin: t.admin.contractEnd || "" });
  }, [t.admin]);

  const admin = t.admin;
  if (!admin) {
    return (
      <div className="table-wrap" style={{ padding: 18 }}>
        <span className="muted">Cargando configuración…</span>
      </div>
    );
  }

  const perfil = ses.currentProfile;
  const esGerencia = perfil === "gerencia";
  const sinPermisos = !esGerencia && PERM_KEYS.every((k) => !ses.profileCan(k));

  // ── Equipos ──────────────────────────────────────────────────────
  const agregarEquipo = async (e: FormEvent) => {
    e.preventDefault();
    setMsgEquipos({});
    const name = eqNuevo.name.trim();
    if (!name) { setMsgEquipos({ error: "El nombre del equipo es obligatorio." }); return; }
    if (admin.equipos.some((x) => x.name === name)) { setMsgEquipos({ error: "Ese equipo ya está en la lista." }); return; }
    try {
      await t.saveAdminCfg((a) => {
        a.equipos.push({ name, weight: eqNuevo.weight.trim(), clase: eqNuevo.clase.trim() || undefined });
      });
      setEqNuevo({ name: "", weight: "", clase: "" });
    } catch (err) {
      setMsgEquipos({ error: err instanceof Error ? err.message : "No se pudo guardar el equipo." });
    }
  };

  // ── Festivos ─────────────────────────────────────────────────────
  const agregarFestivo = async (e: FormEvent) => {
    e.preventDefault();
    setMsgFestivos({});
    if (!festNuevo.date) { setMsgFestivos({ error: "La fecha del festivo es obligatoria." }); return; }
    if (allFestivos(admin).some((f) => f.date === festNuevo.date)) {
      setMsgFestivos({ error: "Esa fecha ya está registrada como festivo." });
      return;
    }
    try {
      await t.saveAdminCfg((a) => {
        a.festivosCustom.push({ date: festNuevo.date, label: festNuevo.label.trim() || "Festivo adicional" });
      });
      setFestNuevo({ date: "", label: "" });
    } catch (err) {
      setMsgFestivos({ error: err instanceof Error ? err.message : "No se pudo guardar el festivo." });
    }
  };

  // ── Contrato (solo gerencia) ─────────────────────────────────────
  const guardarContrato = async (e: FormEvent) => {
    e.preventDefault();
    setMsgContrato({});
    if (!esGerencia) { setMsgContrato({ error: "Solo Gerencia puede modificar la vigencia del contrato." }); return; }
    if (!contrato.inicio || !contrato.fin) { setMsgContrato({ error: "Debes indicar fecha de inicio y fecha de fin." }); return; }
    if (contrato.fin <= contrato.inicio) { setMsgContrato({ error: "La fecha de fin debe ser posterior a la de inicio." }); return; }
    const vigencia = `${fdate(contrato.inicio)} → ${fdate(contrato.fin)}`;
    if (!window.confirm(`¿Actualizar la vigencia del contrato a ${vigencia}? El panel recalculará los meses visibles y la línea de tiempo.`)) return;
    try {
      await t.saveAdminCfg((a) => {
        a.contractStart = contrato.inicio;
        a.contractEnd = contrato.fin;
      });
      setMsgContrato({ ok: `Vigencia actualizada: ${vigencia}.` });
    } catch (err) {
      setMsgContrato({ error: err instanceof Error ? err.message : "No se pudo actualizar la vigencia." });
    }
  };

  // ── Permisos y claves (solo gerencia) ────────────────────────────
  const togglePermiso = async (k: PerfilKey, perm: PermKey, checked: boolean) => {
    setMsgPermisos({});
    try {
      await t.saveAdminCfg((a) => {
        const p = a.profiles[k];
        if (!p.perms) {
          p.perms = { interventores: false, areas: false, vehiculos: false, equipos: false, festivos: false, personal: false };
        }
        p.perms[perm] = checked;
      });
    } catch (err) {
      setMsgPermisos({ error: err instanceof Error ? err.message : "No se pudo guardar el permiso." });
    }
  };

  // ── Backup (solo gerencia) ───────────────────────────────────────
  const descargarCopia = async () => {
    setMsgBackup({});
    try {
      await t.downloadBackup();
      setMsgBackup({ ok: "Copia de seguridad descargada." });
    } catch (err) {
      setMsgBackup({ error: err instanceof Error ? err.message : "No se pudo generar la copia." });
    }
  };

  const restaurarDesdeArchivo = async (file: File) => {
    setMsgBackup({});
    setRestaurando(true);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error("El archivo no es un JSON válido.");
      }
      const v = validateBackup(payload);
      if (!v.ok) throw new Error(v.error);
      if (!window.confirm(`Se restaurarán ${v.blocks} bloques de datos de la copia del ${v.fecha}. Esto SOBRESCRIBE los datos actuales del panel. ¿Continuar?`)) {
        return;
      }
      const bloques = await t.restoreFromBackup(payload);
      setMsgBackup({ ok: `Copia restaurada: ${bloques} bloque(s) de datos.` });
    } catch (err) {
      setMsgBackup({ error: err instanceof Error ? err.message : "No se pudo restaurar la copia." });
    } finally {
      setRestaurando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Administración</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Listas maestras que alimentan los desplegables de «Registrar servicio». Cada cambio se guarda
        de inmediato para todo el equipo.
      </p>

      {sinPermisos && (
        <div className="table-wrap" style={{ padding: 18, marginBottom: 16 }}>
          <span className="muted">
            Tu perfil aún no tiene permisos asignados sobre las listas maestras. Solicita a Gerencia
            que te habilite las secciones que necesitas.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {ses.profileCan("interventores") && (
          <Seccion titulo="Interventores" sub="Funcionarios de Triple A que aprueban los servicios.">
            <ListaMaestra
              items={admin.interventores}
              placeholder="Nombre del interventor"
              dupMsg="Ese interventor ya está en la lista."
              saving={t.saving}
              onAdd={(v) => t.saveAdminCfg((a) => { a.interventores.push(v); }).then(() => undefined)}
              onRemove={(v) => t.saveAdminCfg((a) => { a.interventores = a.interventores.filter((x) => x !== v); }).then(() => undefined)}
            />
          </Seccion>
        )}

        {ses.profileCan("areas") && (
          <Seccion titulo="Áreas AAA" sub="Áreas solicitantes de Triple A.">
            <ListaMaestra
              items={admin.areas}
              placeholder="Nombre del área"
              dupMsg="Esa área ya está en la lista."
              saving={t.saving}
              onAdd={(v) => t.saveAdminCfg((a) => { a.areas.push(v); }).then(() => undefined)}
              onRemove={(v) => t.saveAdminCfg((a) => { a.areas = a.areas.filter((x) => x !== v); }).then(() => undefined)}
            />
          </Seccion>
        )}

        {ses.profileCan("equipos") && (
          <Seccion titulo="Equipos" sub="Maquinaria transportada (el peso se autollena al registrar).">
            <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
              {admin.equipos.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Lista vacía.</span>}
              {admin.equipos.map((eq) => (
                <div key={eq.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1 }}>
                    <b>{eq.name}</b>
                    <span className="cc-dias">
                      {[
                        eq.clase,
                        `${num(eq.weight)} Ton`,
                        eq.marca,
                        eq.cantidad !== undefined && eq.cantidad !== null && eq.cantidad !== "" ? `Cant. ${num(eq.cantidad)}` : null,
                        eq.alto && eq.ancho && eq.largo ? `${num(eq.alto)}×${num(eq.ancho)}×${num(eq.largo)} m` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--high)" }}
                    onClick={() =>
                      void t.saveAdminCfg((a) => { a.equipos = a.equipos.filter((x) => x.name !== eq.name); }).catch(() => undefined)
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={agregarEquipo} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
              <input className="input" placeholder="Nombre del equipo *" value={eqNuevo.name} onChange={(e) => setEqNuevo((f) => ({ ...f, name: e.target.value }))} />
              <input className="input" type="number" min={0} step="0.01" placeholder="Peso (Ton)" value={eqNuevo.weight} onChange={(e) => setEqNuevo((f) => ({ ...f, weight: e.target.value }))} />
              <input className="input" placeholder="Clase" value={eqNuevo.clase} onChange={(e) => setEqNuevo((f) => ({ ...f, clase: e.target.value }))} />
              <button className="btn btn-ghost btn-sm" type="submit" disabled={t.saving}>Agregar</button>
            </form>
            <MsgInline error={msgEquipos.error} ok={msgEquipos.ok} />
          </Seccion>
        )}

        {ses.profileCan("festivos") && (
          <Seccion titulo="Festivos" sub="Los oficiales (Ley Emiliani) no son editables; agrega los adicionales.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {FESTIVOS_DEFAULT.map((f) => (
                <Chip key={f.date} title="Calendario oficial (no editable)">
                  {fdate(f.date)} · {f.label}
                </Chip>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {admin.festivosCustom.length === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>Sin festivos personalizados.</span>
              )}
              {admin.festivosCustom.map((f) => (
                <Chip
                  key={f.date}
                  onRemove={() =>
                    void t.saveAdminCfg((a) => { a.festivosCustom = a.festivosCustom.filter((x) => x.date !== f.date); }).catch(() => undefined)
                  }
                >
                  {fdate(f.date)} · {f.label}
                </Chip>
              ))}
            </div>
            <form onSubmit={agregarFestivo} style={{ display: "grid", gap: 8, gridTemplateColumns: "150px 1fr auto" }}>
              <input className="input" type="date" required value={festNuevo.date} onChange={(e) => setFestNuevo((f) => ({ ...f, date: e.target.value }))} />
              <input className="input" placeholder="Festivo adicional" value={festNuevo.label} onChange={(e) => setFestNuevo((f) => ({ ...f, label: e.target.value }))} />
              <button className="btn btn-ghost btn-sm" type="submit" disabled={t.saving}>Agregar</button>
            </form>
            <MsgInline error={msgFestivos.error} ok={msgFestivos.ok} />
          </Seccion>
        )}

        {esGerencia && (
          <Seccion
            titulo="Vigencia del contrato"
            sub="Al guardar, el panel recalcula los meses visibles y la línea de tiempo (fecha fin inclusiva)."
          >
            <form onSubmit={guardarContrato} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <label className="field">Fecha de inicio *
                  <input className="input" type="date" required value={contrato.inicio} onChange={(e) => setContrato((c) => ({ ...c, inicio: e.target.value }))} />
                </label>
                <label className="field">Fecha de fin (inclusiva) *
                  <input className="input" type="date" required value={contrato.fin} onChange={(e) => setContrato((c) => ({ ...c, fin: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={t.saving}>
                  {t.saving ? "Guardando…" : "Actualizar vigencia"}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>Meses actuales: {t.months.length}</span>
              </div>
              <MsgInline error={msgContrato.error} ok={msgContrato.ok} />
            </form>
          </Seccion>
        )}

        {esGerencia && (
          <Seccion titulo="Permisos por perfil" sub="Secciones de listas maestras habilitadas para Renzo y Jesús (guardado inmediato).">
            <div style={{ display: "grid", gap: 16 }}>
              {PERFILES_CON_PERMISOS.map((k) => {
                const p = admin.profiles[k];
                return (
                  <div key={k}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.label}</div>
                    <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                      {PERM_KEYS.map((perm) => (
                        <label key={perm} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-2)" }}>
                          <input
                            type="checkbox"
                            checked={!!p.perms?.[perm]}
                            onChange={(e) => void togglePermiso(k, perm, e.target.checked)}
                          />
                          {PERM_LABELS[perm]}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10 }}>
              <MsgInline error={msgPermisos.error} ok={msgPermisos.ok} />
            </div>
          </Seccion>
        )}


        {esGerencia && (
          <Seccion titulo="Cuentas de la plataforma" sub="Las cuentas y roles ahora se administran en el módulo Usuarios y roles.">
            <a className="btn btn-ghost btn-sm" href="/usuarios">Ir a Usuarios y roles</a>
          </Seccion>
        )}

        {esGerencia && (
          <Seccion
            titulo="Copia de seguridad"
            sub="Descarga un respaldo completo (adminconfig, tarifario y servicios de todos los meses) o restaura desde un archivo JSON."
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-primary btn-sm" onClick={() => void descargarCopia()} disabled={t.saving || restaurando}>
                Descargar copia
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={t.saving || restaurando}>
                {restaurando ? "Restaurando…" : "Restaurar desde copia"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void restaurarDesdeArchivo(f);
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {admin.backupLastAt
                ? `Última copia descargada: ${new Date(admin.backupLastAt).toLocaleString("es-CO")}`
                : "Aún no se ha descargado ninguna copia."}
            </div>
            <div style={{ marginTop: 8 }}>
              <MsgInline error={msgBackup.error} ok={msgBackup.ok} />
            </div>
          </Seccion>
        )}
      </div>

    </>
  );
}
