"use client";
// ════════════════════════════════════════════════════════════════════
// Inicio de sesión de la plataforma (Supabase Auth, email + contraseña).
// Sin registro público: las cuentas las crea el administrador
// (scripts/crear-usuarios.ts). El middleware manda aquí a todo el que no
// tenga sesión; con sesión, /login redirige al inicio.
// ════════════════════════════════════════════════════════════════════

import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const supa = supabaseBrowser(); // null → Supabase sin configurar (modo demo)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supa) {
      window.location.href = "/"; // modo demo: sin login que validar
      return;
    }
    if (!email.trim() || !password) {
      setError("Escribe tu correo y tu contraseña.");
      return;
    }
    setEnviando(true);
    const { error: err } = await supa.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
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
    // Recarga completa para que el middleware vea las cookies de sesión.
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") ? next : "/";
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

        <h1 className="login-title">Iniciar sesión</h1>
        <p className="login-sub">Panel operativo de cartera, cobranza y Proyecto Triple A.</p>

        {!supa && (
          <div className="login-error" role="status" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            Supabase no está configurado: la app corre en modo demostración. Pulsa «Entrar» para continuar.
          </div>
        )}

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

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button className="btn btn-primary login-btn" type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <p className="login-foot">Acceso privado. Las cuentas las crea la administración de la plataforma.</p>
      </form>
    </div>
  );
}
