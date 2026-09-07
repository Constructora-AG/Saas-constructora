import { redirect } from "next/navigation";

// Proyecto Triple A: sus secciones son módulos internos con ruta propia
// (/aaa/consolidado, /aaa/alquiler, /aaa/emergencia, /aaa/prefacturas,
// /aaa/transporte). La raíz lleva al consolidado.
export default function AaaPage() {
  redirect("/aaa/consolidado");
}
