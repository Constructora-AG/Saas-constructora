import { redirect } from "next/navigation";
import { exigirModuloAaa } from "./_auth";

// Proyecto Triple A: sus secciones son módulos internos con ruta propia
// (/aaa/consolidado, /aaa/alquiler, /aaa/emergencia, /aaa/prefacturas,
// /aaa/transporte). La raíz lleva al consolidado.
export default async function AaaPage() {
  await exigirModuloAaa("aaa");
  redirect("/aaa/consolidado");
}