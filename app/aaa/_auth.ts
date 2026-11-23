import { redirect } from "next/navigation";
import { puedeVer, rutaInicial } from "@/lib/auth/modulos";
import { usuarioServidor } from "@/lib/auth/servidor";

/**
 * Autoriza páginas AAA en el servidor antes de cargar datos o montar clientes.
 * El AppShell mantiene una comprobación visual, pero no puede ser la frontera
 * de seguridad porque se ejecuta en el navegador.
 */
export async function exigirModuloAaa(modulo: string): Promise<void> {
  await exigirAlgunModuloAaa([modulo]);
}

/**
 * Igual que `exigirModuloAaa`, pero basta con ver uno de los módulos. Lo usan
 * los módulos de prefacturas de cada contrato: entra quien ve Proyecto Triple A
 * o ese contrato (misma regla que /api/aaa/prefacturas).
 */
export async function exigirAlgunModuloAaa(modulos: string[]): Promise<void> {
  const usuario = await usuarioServidor();
  if (!usuario) redirect("/login");
  if (!modulos.some((m) => puedeVer(usuario, m))) redirect(rutaInicial(usuario));
}
