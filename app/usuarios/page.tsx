import { UsuariosClient } from "./UsuariosClient";

export const dynamic = "force-dynamic";

// Módulo de Usuarios de la plataforma: crear cuentas, asignar roles,
// restablecer contraseñas y eliminar. Solo Gerencia (la API lo re-verifica).
export default function UsuariosPage() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Usuarios y roles</h1>
        <p className="page-sub">Crea las cuentas de acceso de la plataforma, asigna el rol de cada persona, restablece contraseñas y elimina cuentas. Solo Gerencia.</p>
      </div>
      <UsuariosClient />
    </>
  );
}
