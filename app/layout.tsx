import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "./AppShell";
import { UsuarioProvider } from "@/lib/auth/useUsuario";

export const metadata: Metadata = {
  title: "Cartera · Constructora Anaya Giraldo",
  description: "Control de cartera y cobranza",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <UsuarioProvider>
          <AppShell>{children}</AppShell>
        </UsuarioProvider>
      </body>
    </html>
  );
}
