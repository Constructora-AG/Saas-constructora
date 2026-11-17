import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { obtenerUrlCallbackAuth } from "@/lib/auth/invitationCallback";

export async function POST(req: NextRequest) {
  try {
    const body: { email?: string } = await req.json();

    const email = body.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Correo electrónico inválido" },
        { status: 400 },
      );
    }

    const supa = await supabaseServer();

    if (!supa) {
      return NextResponse.json(
        { error: "Supabase no está configurado" },
        { status: 500 },
      );
    }

    const callbackUrl = obtenerUrlCallbackAuth();

    const { error } = await supa.auth.resetPasswordForEmail(email, {
      redirectTo: new URL(
        "/auth/callback?next=/auth/restablecer-contrasena",
        callbackUrl,
      ).toString(),
    });

    if (error) {
      console.error("Password recovery request failed", {
        message: error.message,
        status: error.status,
      });

      // No revelar si la cuenta existe.
      return NextResponse.json({
        ok: true,
        message:
          "Si el correo corresponde a una cuenta registrada, recibirás instrucciones para recuperar tu contraseña.",
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        "Si el correo corresponde a una cuenta registrada, recibirás instrucciones para recuperar tu contraseña.",
    });
  } catch (error) {
    console.error("Password recovery API error", error);

    return NextResponse.json(
      { error: "No se pudo procesar la solicitud" },
      { status: 500 },
    );
  }
}
