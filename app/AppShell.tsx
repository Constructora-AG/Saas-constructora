"use client";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IconHome, IconWallet, IconActivity, IconMessage, IconChart, IconMenu, IconBuilding, IconTruck, IconLogout, IconMegaphone } from "./icons";
import { useUsuario, ROL_LABELS } from "@/lib/auth/useUsuario";
import { moduloDeRuta, puedeVer, rutaInicial } from "@/lib/auth/modulos";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** id del módulo en lib/auth/modulos.ts (controla visibilidad por rol). */
  modulo: string;
  /** Sub-módulos (se muestran anidados bajo el ítem). */
  children?: NavItem[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operación",
    items: [
      { href: "/", label: "Resumen", icon: <IconHome />, modulo: "resumen" },
      { href: "/cartera", label: "Cartera", icon: <IconWallet />, modulo: "cartera" },
      { href: "/cobranza", label: "Bitácora", icon: <IconMessage />, modulo: "bitacora" },
      { href: "/recaudo", label: "Recaudo", icon: <IconChart />, modulo: "recaudo" },
      { href: "/supervision", label: "Vendedores", icon: <IconActivity />, modulo: "vendedores" },
    ],
  },
  {
    section: "Comercial",
    items: [
      { href: "/marketing", label: "Marketing y leads", icon: <IconMegaphone />, modulo: "marketing" },
    ],
  },
  {
    section: "Finanzas",
    items: [
      {
        href: "/aaa", label: "Proyecto Triple A", icon: <IconBuilding />, modulo: "aaa",
        children: [
          { href: "/aaa/consolidado", label: "Consolidado", icon: null, modulo: "aaa" },
          { href: "/aaa/alquiler", label: "Contrato Alquiler (Old)", icon: null, modulo: "aaa" },
          { href: "/aaa/contrato-alquiler", label: "Contrato de Alquiler", icon: <IconBuilding />, modulo: "alquiler" },
          { href: "/aaa/emergencia", label: "Otro Sí / Emergencia", icon: null, modulo: "aaa" },
          { href: "/aaa/prefacturas", label: "Prefacturas", icon: null, modulo: "aaa" },
          { href: "/aaa/transporte", label: "Transporte AAA", icon: <IconTruck />, modulo: "transporte" },
        ],
      },
    ],
  },
  {
    section: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios y roles", icon: <IconActivity />, modulo: "usuarios" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/": "Resumen general",
  "/cartera": "Cartera y cobranza",
  "/cobranza": "Bitácora de cobranza",
  "/recaudo": "Recaudo por proyecto",
  "/supervision": "Vendedores",
  "/marketing": "Marketing y gestión de leads",
  "/aaa/transporte": "Proyecto Triple A — Control Transporte AAA (Contrato IS No. 04-2026)",
  "/aaa/consolidado": "Proyecto Triple A — Consolidado",
  "/aaa/alquiler": "Proyecto Triple A — Contrato Alquiler (Old)",
  "/aaa/contrato-alquiler": "Proyecto Triple A — Contrato de Alquiler",
  "/aaa/emergencia": "Proyecto Triple A — Otro Sí / Emergencia",
  "/aaa/prefacturas": "Proyecto Triple A — Prefacturas",
  "/aaa": "Proyecto Triple A",
  "/usuarios": "Usuarios y roles de la plataforma",
};

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { usuario, cargando, cerrarSesion } = useUsuario();

  // /login se pinta a pantalla completa, sin barra lateral ni topbar.
  if (path === "/login") return <>{children}</>;

  const iniciales = usuario
    ? usuario.nombre
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AG";

  // "/aaa" es exacto para que no quede activo junto con "/aaa/transporte".
  const activeHref = (href: string) => (href === "/" ? path === href : path === href || path.startsWith(href + "/"));
  const currentTitle =
    Object.entries(TITLES).find(([h]) => (h === "/" ? path === "/" : path.startsWith(h)))?.[1] ?? "Constructora Anaya Giraldo";

  return (
    <div className="app-shell">
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-brand">
          <span className="sidebar-logo">AG</span>
          <span className="sidebar-brand-text">
            <b>Anaya Giraldo</b>
            <small>Constructora</small>
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((group) => ({
            ...group,
            items: group.items
              .map((i) => (i.children ? { ...i, children: i.children.filter((c) => puedeVer(usuario, c.modulo)) } : i))
              .filter((i) => (i.children ? i.children.length > 0 : puedeVer(usuario, i.modulo))),
          }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
            <div key={group.section} className="nav-group">
              <div className="nav-group-title">{group.section}</div>
              {group.items.map((item) => (
                <div key={item.href}>
                  <a
                    href={item.children ? item.children[0].href : item.href}
                    onClick={() => setOpen(false)}
                    className={`nav-item${(item.children ? path.startsWith(item.href) : activeHref(item.href)) ? " active" : ""}`}
                  >
                    <span className="nav-item-icon">{item.icon}</span>
                    {item.label}
                  </a>
                  {item.children && (
                    <div className="nav-sub">
                      {item.children.map((c) => (
                        <a
                          key={c.href}
                          href={c.href}
                          onClick={() => setOpen(false)}
                          className={`nav-item nav-sub-item${activeHref(c.href) ? " active" : ""}`}
                        >
                          {c.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="sidebar-foot-session">
            <span className="avatar">{iniciales}</span>
            <span className="sidebar-foot-text">
              <b>{usuario ? usuario.nombre : cargando ? "Cargando…" : "Sin sesión"}</b>
              <small>{usuario ? ROL_LABELS[usuario.rol] : "Panel operativo"}</small>
            </span>
          </span>
          {usuario && (
            <button className="sidebar-logout" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => void cerrarSesion()}>
              <IconLogout />
            </button>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="topbar-burger" aria-label="Menú" onClick={() => setOpen((v) => !v)}>
            <IconMenu />
          </button>
          <span className="topbar-title">{currentTitle}</span>
          <span className="topbar-spacer" />
          <span className="topbar-env"><span className="dot" style={{ background: "currentColor" }} /> Datos en vivo</span>
        </header>

        <div className="container">
          {(() => {
            const mod = moduloDeRuta(path);
            if (!usuario || !mod || puedeVer(usuario, mod.id)) return children;
            return (
              <div className="table-wrap" style={{ padding: 24 }}>
                <b>Acceso restringido.</b>{" "}
                <span className="muted">Tu rol ({ROL_LABELS[usuario.rol]}) no incluye el módulo «{mod.label}». Pide acceso al Super admin.</span>
                <div style={{ marginTop: 12 }}><a className="btn btn-ghost btn-sm" href={rutaInicial(usuario)}>Ir a mi inicio</a></div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
