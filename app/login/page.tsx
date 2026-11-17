"use client";

// Inicio de sesión y recuperación de contraseña.
// Supabase Auth: email + contraseña.
// Sin registro público: las cuentas las crea el administrador.

import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const supa = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  const [recuperacionEnviada, setRecuperacionEnviada] = useState(false);

  // INICIO DE SESIÓN
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supa) {
      window.location.href = "/";
      return;
    }

    if (!email.trim() || !password) {
      setError("Escribe tu correo y tu contraseña.");
      return;
    }

    setEnviando(true);

    const { error: err } = await supa.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (err) {
      console.error("Supabase sign-in failed", {
        name: err.name,
        message: err.message,
        status: err.status,
        code: err.code,
      });

      setEnviando(false);

      setError(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : err.message.includes("Email not confirmed")
            ? "El correo de esta cuenta aún no está confirmado."
            : "No se pudo iniciar sesión. Intenta de nuevo en un momento.",
      );

      return;
    }

    const next = new URLSearchParams(window.location.search).get("next");

    window.location.href = next && next.startsWith("/") ? next : "/";
  };

  // RECUPERACIÓN DE CONTRASEÑA
 
const onRecovery = async (e: FormEvent) => {
  e.preventDefault();
  setError(null);

  if (!email.trim()) {
    setError("Escribe tu correo electrónico.");
    return;
  }

  setEnviando(true);

  try {
    const response = await fetch("/api/usuarios/password-recovery", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "No se pudo procesar la solicitud.");
      setEnviando(false);
      return;
    }

    setRecuperacionEnviada(true);
  } catch (error) {
    console.error("Recovery request failed", error);
    setError("Error de conexión. Intenta nuevamente.");
  } finally {
    setEnviando(false);
  }
};


  // VOLVER AL LOGIN
  const volverLogin = () => {
    setModoRecuperacion(false);
    setRecuperacionEnviada(false);
    setError(null);
    setPassword("");
  };

  return (
    <div className="login-screen">
      <form
        className="login-card"
        onSubmit={modoRecuperacion ? onRecovery : onSubmit}
        noValidate
      >
        {/* IDENTIDAD CORPORATIVA */}
        <div className="login-brand">
          <span className="login-logo">AG</span>

          <span className="login-brand-text">
            <b>Anaya Giraldo</b>
            <small>Constructora</small>
          </span>
        </div>

        {/* TÍTULO DINÁMICO */}
        <h1 className="login-title">
          {recuperacionEnviada
            ? "Revisa tu correo"
            : modoRecuperacion
              ? "Restablecer contraseña"
              : "Iniciar sesión"}
        </h1>

        {/* DESCRIPCIÓN DINÁMICA */}
        <p className="login-sub">
          {recuperacionEnviada
            ? "Si el correo corresponde a una cuenta registrada, recibirás instrucciones para recuperar tu contraseña."
            : modoRecuperacion
              ? "Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña."
              : "Panel operativo de cartera, cobranza y Proyecto Triple A."}
        </p>

        {/* AVISO MODO DEMOSTRACIÓN */}
        {!supa && !modoRecuperacion && !recuperacionEnviada && (
          <div
            className="login-error"
            role="status"
            style={{
              background: "var(--warn-soft)",
              color: "var(--warn)",
            }}
          >
            Supabase no está configurado: la app corre en modo demostración.
            Pulsa «Entrar» para continuar.
          </div>
        )}

        {/* CONFIRMACIÓN DE RECUPERACIÓN */}
        {recuperacionEnviada && (
          <div
            className="login-error"
            role="status"
            style={{
              background: "var(--warn-soft)",
              color: "var(--warn)",
            }}
          >
            Hemos procesado tu solicitud de recuperación.
            <br />
            <br />
            Si el correo corresponde a una cuenta registrada, recibirás las
            instrucciones para restablecer tu contraseña.
            <br />
            <br />
            <b>{email}</b>
          </div>
        )}

        {/* FORMULARIO */}
        {!recuperacionEnviada && (
          <>
            {/* CORREO ELECTRÓNICO */}
            <label className="field login-field">
              Correo electrónico
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="nombre@agconstructora.com.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={enviando}
              />
            </label>

            {/* CONTRASEÑA: SOLO EN LOGIN */}
            {!modoRecuperacion && (
              <>
                <label className="field login-field">
                  Contraseña
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={enviando}
                  />
                </label>

                {/* ENLACE DE RECUPERACIÓN */}
                <div className="login-recovery">
                  <button
                    type="button"
                    className="login-link"
                    onClick={() => {
                      setModoRecuperacion(true);
                      setError(null);
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* MENSAJE DE ERROR */}
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        {/* BOTÓN PRINCIPAL: UNO SOLO */}
        {!recuperacionEnviada && (
          <button
            className="btn btn-primary login-btn"
            type="submit"
            disabled={enviando}
          >
            {enviando
              ? modoRecuperacion
                ? "Enviando…"
                : "Entrando…"
              : modoRecuperacion
                ? "Enviar enlace de recuperación"
                : "Entrar"}
          </button>
        )}

        {/* BOTÓN VOLVER: SOLO EN RECUPERACIÓN O CONFIRMACIÓN */}
        {(modoRecuperacion || recuperacionEnviada) && (
          <button type="button" className="login-back" onClick={volverLogin}>
            ← Volver al inicio de sesión
          </button>
        )}

        {/* PIE DE PÁGINA */}
        <p className="login-foot">
          Acceso privado. Las cuentas las crea la administración de la
          plataforma.
        </p>
      </form>
    </div>
  );
}
