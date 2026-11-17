"use client";

import { useMemo, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface PasswordFormProps {
  mode: "invite" | "recovery";
}

export function PasswordForm({ mode }: PasswordFormProps) {
  const supa = supabaseBrowser();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const title = mode === "invite" ? "Configura tu contraseña" : "Restablece tu contraseña";
  const description = mode === "invite"
    ? "Crea la contraseña que usarás para acceder a la plataforma."
    : "Escribe una nueva contraseña para recuperar el acceso a tu cuenta.";

  const requisitos = useMemo(() => [
    { id: "length", label: "Al menos 8 caracteres", ok: password.length >= 8 },
    { id: "uppercase", label: "Una letra mayúscula", ok: /[A-ZÁÉÍÓÚÑ]/.test(password) },
    { id: "lowercase", label: "Una letra minúscula", ok: /[a-záéíóúñ]/.test(password) },
    { id: "number", label: "Un número", ok: /\d/.test(password) },
  ], [password]);

  const criteriosCumplidos = requisitos.filter((requisito) => requisito.ok).length;
  const seguridad = password.length === 0
    ? { label: "Sin evaluar", className: "password-strength-empty" }
    : criteriosCumplidos <= 1
      ? { label: "Muy débil", className: "password-strength-weak" }
      : criteriosCumplidos === 2
        ? { label: "Débil", className: "password-strength-fair" }
        : criteriosCumplidos === 3
          ? { label: "Buena", className: "password-strength-good" }
          : { label: "Fuerte", className: "password-strength-strong" };

  const confirmacionEscrita = confirmation.length > 0;
  const contrasenasCoinciden = password === confirmation;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!supa) {
      setError("Supabase no está configurado.");
      return;
    }
    if (criteriosCumplidos < requisitos.length) {
      setError("Completa todos los requisitos de seguridad de la contraseña.");
      return;
    }
    if (!contrasenasCoinciden) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supa.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      console.error("Password update failed", {
        message: updateError.message,
        status: updateError.status,
        code: updateError.code,
      });
      setError("No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.");
      return;
    }

    setSaved(true);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <div className="login-brand">
          <span className="login-logo">AG</span>
          <span className="login-brand-text">
            <b>Anaya Giraldo</b>
            <small>Constructora</small>
          </span>
        </div>

        <h1 className="login-title">{saved ? "Contraseña actualizada" : title}</h1>
        <p className="login-sub">
          {saved ? "Ya puedes continuar al panel de la plataforma." : description}
        </p>

        {saved ? (
          <button className="btn btn-primary login-btn" type="button" onClick={() => { window.location.href = "/"; }}>
            Continuar
          </button>
        ) : (
          <>
            <label className="field login-field">
              Nueva contraseña
              <div className="password-input-wrap">
                <input
                  className="input"
                  type={mostrarPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  aria-describedby="password-requirements password-strength"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(null); }}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setMostrarPassword((visible) => !visible)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  disabled={saving}
                >
                  {mostrarPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>

            <div id="password-strength" className="password-strength" aria-live="polite">
              <div className="password-strength-head">
                <span>Seguridad de la contraseña</span>
                <strong className={seguridad.className}>{seguridad.label}</strong>
              </div>
              <div className="password-meter" aria-hidden="true">
                {[1, 2, 3, 4].map((nivel) => (
                  <span key={nivel} className={nivel <= criteriosCumplidos ? seguridad.className : ""} />
                ))}
              </div>
            </div>

            <ul id="password-requirements" className="password-requirements" aria-label="Requisitos de la contraseña">
              {requisitos.map((requisito) => (
                <li key={requisito.id} className={requisito.ok ? "password-requirement-ok" : ""}>
                  <span aria-hidden="true">{requisito.ok ? "✓" : "○"}</span>
                  {requisito.label}
                </li>
              ))}
            </ul>

            <label className="field login-field">
              Confirmar contraseña
              <div className="password-input-wrap">
                <input
                  className="input"
                  type={mostrarConfirmacion ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  aria-invalid={confirmacionEscrita && !contrasenasCoinciden}
                  value={confirmation}
                  onChange={(event) => { setConfirmation(event.target.value); setError(null); }}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setMostrarConfirmacion((visible) => !visible)}
                  aria-label={mostrarConfirmacion ? "Ocultar confirmación" : "Mostrar confirmación"}
                  disabled={saving}
                >
                  {mostrarConfirmacion ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {confirmacionEscrita && (
                <span className={contrasenasCoinciden ? "password-match-ok" : "password-match-error"}>
                  {contrasenasCoinciden ? "Las contraseñas coinciden." : "Las contraseñas no coinciden."}
                </span>
              )}
            </label>

            {error && <div className="login-error" role="alert">{error}</div>}

            <button className="btn btn-primary login-btn" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar contraseña"}
            </button>
          </>
        )}

        {!saved && (
          <p className="login-foot">
            Usa al menos 8 caracteres, una mayúscula, una minúscula y un número.
          </p>
        )}
      </form>
    </div>
  );
}
