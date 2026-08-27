# UI-GUÍA — Sistema de diseño AG Constructora (para el módulo Transporte AAA)

> Objetivo: que el panel de Control de Transporte AAA (`/aaa/transporte`) se vea **idéntico** al resto del
> software. Todo lo que hay aquí sale de código real del proyecto. No inventes clases nuevas si ya existe
> una equivalente en `app/globals.css`. **No hay Tailwind, no hay librería de componentes ni de gráficas**:
> el sistema es CSS propio (clases globales) + estilos inline puntuales.

Archivos de referencia obligada:

| Qué | Archivo |
|---|---|
| Tokens y todas las clases | `app/globals.css` |
| Shell (sidebar + topbar) | `app/AppShell.tsx` |
| Iconos SVG propios | `app/icons.tsx` |
| Vista hermana (tabs, KPIs, tablas, filas expandibles) | `app/aaa/AaaClient.tsx` |
| Formulario de registro + tabla con estados | `app/aaa/PrefacturasClient.tsx` |
| Tabla con filtros + drawer lateral | `app/cartera/CarteraClient.tsx` |
| Gráficas de barras (horizontal y mensual) | `app/recaudo/RecaudoClient.tsx` |

---

## 1. Tokens (variables CSS de `:root`)

Usa **siempre** las variables, nunca hex sueltos (salvo `#fff` sobre fondos de marca).

```css
/* Neutros */
--bg: #f4f6f9;            /* fondo de página */
--surface: #ffffff;       /* tarjetas, tablas, inputs */
--surface-2: #fafbfc;     /* cabeceras de tabla, hover de fila, sub-tablas */
--border: #e5e8ee;        /* borde estándar */
--border-strong: #d5dbe4; /* borde de inputs y botones ghost */
--text: #0e1b2e;          /* texto principal */
--text-2: #3a4759;        /* texto secundario (celdas) */
--muted: #6a7484;         /* etiquetas, ayudas */

/* Marca — azul institucional */
--brand: #123a7a;  --brand-700: #0e2f63;  --brand-600: #1a4a99;  --brand-500: #2560c2;
--brand-soft: #eef3fb;  --brand-line: #d7e2f3;

/* Estados (semáforo sobrio): color de texto + fondo suave */
--ok:   #0f7a48;  --ok-soft:   #e8f4ed;   /* verde: al día / positivo */
--warn: #8f640f;  --warn-soft: #f8f0da;   /* ámbar: atención / ≤30 días */
--mid:  #a9500f;  --mid-soft:  #f9ead9;   /* naranja: nivel medio */
--high: #9e2323;  --high-soft: #f7e6e6;   /* rojo: vencido / crítico */

/* Radios y sombras */
--radius: 10px;  --radius-sm: 8px;
--shadow-xs: 0 1px 2px rgba(14,27,46,.05);
--shadow: 0 1px 2px rgba(14,27,46,.04), 0 2px 6px rgba(14,27,46,.05);
```

**Tipografía:** stack de sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, …`),
base **14px / line-height 1.5**. No se importan fuentes. Tamaños en uso: título de página 22px/700,
valor KPI 25px/700 (o 19–21px inline cuando es moneda larga), celdas de tabla 13.5px, etiquetas y
cabeceras 11–12.5px. Los números SIEMPRE llevan `font-variant-numeric: tabular-nums` — ya lo dan las
clases `.num`, `.kpi-value`, `.estado-val`.

**Espaciado:** contenedor `padding: 28px 34px 72px`, gaps de grillas 16px, padding de tarjetas 18px,
celdas de tabla `12–13px 18px`. Modo claro únicamente; no hay dark mode.

---

## 2. Estructura de página

El layout raíz (`app/layout.tsx`) envuelve todo en `<AppShell>`: sidebar fijo azul oscuro + topbar +
`<div className="container">{children}</div>`. **La página NO renderiza `.container` ni el shell** —
solo su contenido. El título del topbar sale del mapa `TITLES` de `app/AppShell.tsx`
(ya existe: `"/aaa/transporte": "Control Transporte AAA — Contrato IS No. 04-2026"`) y el ítem de nav
`{ href: "/aaa/transporte", label: "Transporte AAA", icon: <IconTruck /> }`.

Cabecera estándar de cada página (copiada de `app/aaa/page.tsx`):

```tsx
<div className="page-head">
  <h1 className="page-title">Control Transporte AAA</h1>
  <p className="page-sub">
    Contrato IS No. 04-2026 — registro de viajes, facturación mensual y avance del contrato.
  </p>
</div>

<div className="info-bar">
  <IconInfo />
  <div>
    <b>Nota destacada en negrita</b> — texto explicativo del origen de los datos o del estado del módulo.
  </div>
</div>
```

Variante de error del info-bar (patrón real de `app/aaa/page.tsx`):

```tsx
<div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
  <IconInfo />
  <div><b>No se pudieron cargar los datos.</b> …</div>
</div>
```

Separadores de sección (mayúsculas, gris):

```tsx
<div className="section-title">Resumen del contrato</div>
```

---

## 3. Componentes existentes

### 3.1 Tarjetas KPI

`.kpis` es una grilla `repeat(auto-fit, minmax(210px, 1fr))` — con 6 tarjetas se acomoda sola.
El icono lleva tinte de estado con `s-ok` / `s-warn` / `s-high` (sin sufijo = azul de marca).
Para cifras COP largas se reduce el valor con `style={{ fontSize: 19 }}` (o 21), tal como hace AaaClient.

```tsx
<div className="kpis">
  <div className="kpi">
    <div className="kpi-head">
      <span className="kpi-ico s-warn"><IconCoins /></span>
      <span className="kpi-label">Facturado en el mes</span>
    </div>
    <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(valor)}</div>
    <div className="kpi-foot">{p.toFixed(1)}% del contrato</div>
  </div>
  {/* … más .kpi */}
</div>
```

Un KPI puede llevar mini barra de progreso dentro (patrón de RecaudoClient):

```tsx
<div className="kpi">
  <div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Avance</span></div>
  <div className="kpi-value">{pct}%</div>
  <div className="bar-track" style={{ marginTop: 8 }}>
    <div className={`bar-fill${pct >= 100 ? " full" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
  </div>
</div>
```

### 3.2 Tablas

Siempre envueltas en `table-wrap` (+ `table-scroll` si puede desbordar). Cabeceras en minúscula
semántica (el CSS las pone en MAYÚSCULAS). Columnas numéricas: `th`/`td` con
`style={{ textAlign: "right" }}` y clase `num` en el `td`. Negrita en la celda con `<b>` (el CSS le da
`color: var(--text)`).

```tsx
<div className="table-wrap table-scroll">
  <table className="clean">
    <thead>
      <tr>
        <th>Viaje</th>
        <th>Estado</th>
        <th style={{ textAlign: "right" }}>Valor sin IVA</th>
        <th style={{ textAlign: "right" }}>Con IVA</th>
        <th></th>{/* columna de acciones, sin título */}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>V-041</b><span className="cc-dias">12 ago 2026</span></td>
        <td><span className="badge ok">Facturado</span></td>
        <td className="num" style={{ textAlign: "right" }}><b>{COP.format(v)}</b></td>
        <td className="num muted" style={{ textAlign: "right" }}>{COP.format(v * 1.19)}</td>
        <td className="row-actions">…botones…</td>
      </tr>
      {/* fila vacía */}
      <tr><td colSpan={5} className="muted" style={{ padding: 18 }}>Sin registros.</td></tr>
      {/* fila total (patrón AaaClient) */}
      <tr style={{ background: "var(--surface-2)" }}>
        <td><b>Total</b></td><td></td>
        <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{COP.format(t)}</td>
        <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{COP.format(t * 1.19)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>
```

Sub-texto bajo el valor de una celda: `<span className="cc-dias">texto pequeño gris</span>`.

**Fila expandible** (detalle de un registro — patrón MaquinasTable / PrefacturasClient): estado
`const [abierta, setAbierta] = useState<string | null>(null)`, fila principal con
`style={{ cursor: "pointer" }} onClick={…}` y última celda `{open ? "▾" : "▸"}`; debajo, condicional:

```tsx
{open && (
  <tr>
    <td colSpan={N} style={{ background: "var(--surface-2)", padding: "10px 18px 16px" }}>
      <table className="clean" style={{ fontSize: 12.5 }}>…detalle…</table>
    </td>
  </tr>
)}
```

Envuelve fila + detalle en `<Fragment key={…}>` (AaaClient importa `Fragment` de react).

### 3.3 Pestañas (tabs) y toggles

No hay componente Tab: son botones `.segmented > .seg` con estado local, dentro de `.filters-bar`
(patrón exacto de AaaClient):

```tsx
const [tab, setTab] = useState<Tab>("resumen");
…
<div className="filters-bar" style={{ marginTop: 0 }}>
  <div className="segmented">
    <button className={`seg${tab === "resumen" ? " active" : ""}`} onClick={() => setTab("resumen")}>Resumen</button>
    <button className={`seg${tab === "viajes" ? " active" : ""}`} onClick={() => setTab("viajes")}>Viajes</button>
  </div>
  <div className="segmented">{/* toggle secundario, p. ej. Sin IVA / Con IVA */}</div>
</div>
{tab === "resumen" && (<>…</>)}
```

### 3.4 Badges / semáforos

```tsx
<span className="badge ok">Al día</span>
<span className="badge warn">Por vencer</span>
<span className="badge mid">Nivel medio</span>
<span className="badge high">Vencida</span>
```

Mapa de estados → badge (patrón PrefacturasClient, cópialo):

```tsx
const ESTADOS: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "warn" },
  facturada: { label: "Facturada", cls: "ok" },
  vencida:   { label: "Vencida", cls: "high" },
};
const est = ESTADOS[r.estado] ?? { label: r.estado, cls: "warn" };
<span className={`badge ${est.cls}`}>{est.label}</span>
```

Semáforo en el borde izquierdo de la fila: `<tr className="sem-ok">` (`sem-warn`, `sem-mid`, `sem-high`)
en una `table.clean.cartera` — pinta un filete de 3px en la primera celda. Para tarjetas, `client-card u-high` etc.

### 3.5 Panel de datos del contrato

Ficha horizontal de metadatos (`.estado-panel`, patrón AaaClient pestaña "alquiler"):

```tsx
<div className="estado-panel">
  <div className="estado-item"><span className="estado-label">Contrato</span><span className="estado-val">IS No. 04-2026</span></div>
  <div className="estado-item"><span className="estado-label">Cliente</span><span className="estado-val">Triple A de B/Q</span></div>
  <div className="estado-item">
    <span className="estado-label">Vigencia</span>
    <span className="estado-val">{fdate(ini)} — {fdate(fin)}</span>
    <span className="estado-sub">texto de apoyo opcional</span>
  </div>
</div>
```

### 3.6 Botones

```tsx
<button className="btn btn-primary">Guardar</button>
<button className="btn btn-ghost">Cancelar</button>
<button className="btn btn-primary btn-sm">Acción compacta (en tablas)</button>
<button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }}>Rechazar</button>
<button className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
```

Iconos dentro del botón se dimensionan solos (`.btn svg` 16px, `.btn-sm svg` 15px).

### 3.7 Inputs, selects y formularios

Input = `className="input"`; `<select>` va estilizado solo (o también con `input`/`select-sm`).
Campo con etiqueta arriba = `<label className="field">`:

```tsx
<label className="field">Fecha del viaje *
  <input className="input" required type="date" value={form.fecha} onChange={setF("fecha")} />
</label>
<label className="field">Municipio
  <select value={m} onChange={(e) => setM(e.target.value)}>
    <option value="">Todos</option>
    {municipios.map((x) => <option key={x} value={x}>{x}</option>)}
  </select>
</label>
```

Barra de filtros: `<div className="toolbar">…fields…</div>` (flex, alineada abajo, con wrap).

Formulario completo: no hay clase de formulario; se usa `table-wrap` como tarjeta contenedora con grid
inline (patrón exacto PrefacturasClient):

```tsx
<form onSubmit={crear} className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
    <input className="input" required placeholder="N° remisión *" … />
    …
  </div>
  …filas de ítems con grid de columnas fijas…
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <button type="button" className="btn btn-ghost btn-sm">+ Agregar ítem</button>
    <span className="topbar-spacer" style={{ flex: 1 }} />
    <span className="muted" style={{ fontSize: 13 }}>Total <b className="num">{COP.format(total)}</b></span>
    <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
  </div>
  {error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
</form>
```

El formulario se muestra/oculta con un botón en el `section-title` (no un modal):

```tsx
<div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <span>Registro de viajes</span>
  <span className="topbar-spacer" style={{ flex: 1 }} />
  <button className="btn btn-primary btn-sm" onClick={() => setMostrarForm((m) => !m)}>
    {mostrarForm ? "Cancelar" : "Registrar viaje"}
  </button>
</div>
{mostrarForm && (<form …>…</form>)}
```

### 3.8 Modales y drawer

**No existe componente modal.** Los dos patrones nativos del proyecto son:

1. **Formulario inline colapsable** (3.7) — preferido para registrar datos.
2. **Drawer lateral** — para detalle grande. CSS ya existe (`.drawer-overlay`, `.drawer`, `.drawer-head`,
   `.drawer-title`, `.drawer-close`, `.drawer-body`); JSX real en CarteraClient:

```tsx
{verDetalle && (
  <>
    <div className="drawer-overlay" onClick={() => setVerDetalle(null)} />
    <aside className="drawer" role="dialog" aria-label={`Detalle de ${verDetalle}`}>
      <div className="drawer-head">
        <h2 className="drawer-title">{titulo}</h2>
        <button className="drawer-close" onClick={() => setVerDetalle(null)} title="Cerrar (Esc)">×</button>
      </div>
      <div className="drawer-body">…contenido (KPIs, tablas, form)…</div>
    </aside>
  </>
)}
// + cierre con Escape:
useEffect(() => {
  if (!verDetalle) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVerDetalle(null); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [verDetalle]);
```

Si de verdad hace falta un modal centrado (p. ej. el formulario grande de registro de viaje), propuesta
coherente con el sistema — reutiliza los tokens del drawer:

```tsx
// Overlay idéntico al del drawer; caja = table-wrap centrada.
<div className="drawer-overlay" onClick={cerrar} />
<div role="dialog" aria-modal="true" style={{
  position: "fixed", inset: 0, zIndex: 41, display: "grid", placeItems: "center", padding: 20, pointerEvents: "none",
}}>
  <div className="table-wrap" style={{
    pointerEvents: "auto", width: "min(880px, 96vw)", maxHeight: "90vh", overflowY: "auto",
    padding: "18px 22px", boxShadow: "0 18px 48px rgba(9,24,48,.25)",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <h2 className="drawer-title">Registrar viaje</h2>
      <span className="topbar-spacer" style={{ flex: 1 }} />
      <button className="drawer-close" onClick={cerrar} title="Cerrar (Esc)">×</button>
    </div>
    …formulario del §3.7 sin el className table-wrap externo…
  </div>
</div>
```

### 3.9 Toasts / feedback

**No hay toasts.** El feedback es inline y sobrio; sigue estos patrones reales:

- Error de guardado: `{error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}` dentro/junto al form.
- Error de carga de página: `info-bar` en variante roja (§2).
- Estado de proceso: texto en el botón (`{saving ? "Guardando…" : "Guardar"}`) o `<span className="muted">Calculando…</span>` en la toolbar.
- Confirmaciones de estado: la propia fila cambia de badge (optimistic update). No añadas librerías de toast.

---

## 4. Gráficas — SIN librería

`package.json` solo tiene `next`, `react`, `react-dom`, `@supabase/supabase-js`. **Todas las gráficas
son divs con CSS** (clases en globals.css). No instales recharts/chart.js/d3. Dos patrones canónicos:

### 4.1 Barra horizontal de progreso (patrón AaaClient/RecaudoClient)

```tsx
function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const p = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="bar-row">
      <div className="bar-name">{label}</div>
      <div className="bar-track">
        <div className={`bar-fill${p >= 100 ? " full" : ""}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <div className="bar-val">
        <b>{fmtShort(value)}</b>
        <div className="bar-pct">{p.toFixed(1)}% del contrato</div>
      </div>
    </div>
  );
}
// Varias barras dentro de una tarjeta:
<div className="chart-card">
  <div className="chart-title">Ejecución del contrato</div>
  <div className="chart-sub">facturado vs. valor del contrato</div>
  <Bar label="Facturado" value={fact} total={contrato} />
  <Bar label="Facturado + pendiente" value={fact + pend} total={contrato} />
</div>
```

`bar-fill.full` la pinta verde; para sobre-ejecución se sobreescribe:
`style={{ width: "100%", background: "var(--high)" }}` (patrón indirectos de AaaClient). Barra fina
dentro de celdas de tabla: `<div className="bar-track" style={{ height: 14 }}>…`.

### 4.2 Columnas mensuales (serie temporal, patrón RecaudoClient)

Doble medida por mes: track claro = programado/meta, fill oscuro = ejecutado. Alturas en % del máximo.

```tsx
const max = Math.max(1, ...meses.map((m) => m.meta));
<div className="chart-card">
  <div className="chart-title">Facturación mensual</div>
  <div className="chart-sub">Últimos 12 meses</div>
  <div className="chart-legend">
    <span><span className="legend-dot" style={{ background: "var(--brand-soft)" }} />Meta</span>
    <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Facturado</span>
  </div>
  <div className="bars-month">
    {meses.map((m) => {
      const th = (m.meta / max) * 100;                       // altura del track
      const fh = (Math.min(m.real, m.meta) / max) * 100;     // altura del fill
      return (
        <div key={m.mes} className="month-col" title={`${fmtMes(m.mes)} · meta ${fmtM(m.meta)} · real ${fmtM(m.real)}`}>
          <div className="month-bar-wrap">
            <div className="month-track" style={{ height: `${Math.max(2, th)}%` }}>
              <div className="month-fill" style={{ height: `${th > 0 ? (fh / th) * 100 : 0}%` }} />
            </div>
          </div>
          <span className="month-lbl">{fmtMes(m.mes)}</span>
        </div>
      );
    })}
  </div>
</div>
```

### 4.3 Dona (no existe — patrón propuesto coherente)

Si el panel necesita una dona (p. ej. % contrato consumido), hazla con SVG inline y los mismos tokens,
dentro de una `chart-card`; nada de librerías:

```tsx
function Dona({ pct, size = 120 }: { pct: number; size?: number }) {
  const r = 46, c = 2 * Math.PI * r, off = c * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${pct.toFixed(0)}%`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--brand-soft)" strokeWidth="14" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={pct >= 100 ? "var(--high)" : "var(--brand-500)"}
        strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" style={{ font: "700 20px inherit", fill: "var(--text)" }}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}
```

Dos tarjetas de gráficas lado a lado: `<div className="charts-grid">` (colapsa a 1 columna en ≤900px).

---

## 5. Responsive

Solo dos breakpoints, ya resueltos en globals.css — no escribas media queries nuevas si puedes evitarlo:

- **≤900px**: el sidebar pasa a off-canvas (lo maneja AppShell con `.open` + `.sidebar-overlay` y el
  botón `.topbar-burger`); `charts-grid` pasa a 1 columna; el container reduce padding.
- **≤640px**: padding aún menor; `client-card` pasa a 1 columna.
- **Tablas**: no colapsan a tarjetas — simplemente hacen scroll horizontal dentro de
  `table-wrap table-scroll` (`overflow-x: auto`). Mantén ese envoltorio en toda tabla ancha.
- `.kpis` y las grillas de formularios usan `repeat(auto-fit, minmax(…, 1fr))`: se auto-acomodan.

---

## 6. Convenciones de código

- **Server component = page.tsx, client = *Client.tsx.** `app/x/page.tsx` es async server component:
  carga datos (Supabase admin vía `supabaseAdmin()` de `@/lib/supabase/server`, con fallback demo de
  `@/lib/demo`), renderiza `page-head` + `info-bar` y delega en `<XClient initialRows={…} demo={demo} />`.
  Con datos vivos: `export const dynamic = "force-dynamic";`.
- El client component empieza con `"use client";` y maneja tabs/filtros/forms con `useState`/`useMemo`.
  Mutaciones: `fetch("/api/…", { method: "POST"|"PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(…) })`
  y actualización optimista de `rows` en estado local. (Nota: transporte actual usa Firebase en el HTML
  viejo; al nativizar, sigue el patrón Supabase + `/api/aaa/...` de PrefacturasClient.)
- Rutas API en `app/api/…/route.ts`. Tipos y cálculos en `lib/` (`@/lib/aaa/...`), no en el componente.
- **Moneda** (constante a nivel de módulo, en cada archivo que la usa):
  ```tsx
  const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  // abreviada para barras/tablas densas (AaaClient):
  function fmtShort(n: number) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)} mil M`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
    return COP.format(n);
  }
  ```
- **Fechas** (siempre `es-CO`; para fechas `YYYY-MM-DD` añade `T00:00:00` para evitar el corrimiento UTC):
  ```tsx
  const fdate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  const fmtF = (s: string | null) => (s ? fdate(s) : "—");
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1]} ${y.slice(2)}`; };
  ```
  Números sueltos: `n.toLocaleString("es-CO", { maximumFractionDigits: 1 })`. Vacío = `"—"` (em dash).
- **Iconos**: `import { IconTruck, IconCoins, IconInfo } from "../icons";` (desde `app/aaa/transporte/…`
  sería `"../../icons"`). Son SVG stroke `currentColor`, 20px por defecto; el tamaño lo fija el
  contenedor (`.kpi-ico svg`, `.btn svg`…). Si falta un icono, añádelo a `app/icons.tsx` con el mismo
  helper `base()` (viewBox 24, strokeWidth 1.7) — sin dependencias.
- Textos de UI en **español**, tono sobrio, sin emojis (el `info-bar` "reemplaza banners con emoji").
- Comentarios de código en español.

---

## 7. Recetas para el panel de Transporte AAA

### 7.1 Fila de 6 KPIs

Usa `.kpis` tal cual (auto-fit acomoda 6; en pantallas grandes caben en una fila, ver el ejemplo de 6
KPIs real en `Kpis()` de AaaClient y en CarteraClient). Sugerencia de mapeo:

| KPI | icono | tinte |
|---|---|---|
| Valor del contrato | `IconWallet` | (marca) |
| Facturado acumulado | `IconCheck` | `s-ok` |
| Pendiente por facturar | `IconChart` | (marca) |
| Facturas vencidas | `IconAlert` | `s-high` |
| Por vencer (≤30 días) | `IconCoins` | `s-warn` |
| Avance del contrato | `IconTruck` | condicional |

Tinte condicional (patrón "Más antigua sin facturar" de PrefacturasClient):

```tsx
<span className={`kpi-ico ${dias > 0 ? "s-high" : dias > -30 ? "s-warn" : ""}`}><IconAlert /></span>
```

### 7.2 Tabla mensual con pestañas por mes

`segmented` dentro de `filters-bar` con un botón por mes (o un `<select>` `field` si son muchos meses),
y debajo la tabla del §3.2:

```tsx
const [mes, setMes] = useState(meses[meses.length - 1]);
<div className="filters-bar" style={{ marginTop: 0 }}>
  <div className="segmented">
    {meses.map((m) => (
      <button key={m} className={`seg${mes === m ? " active" : ""}`} onClick={() => setMes(m)}>{fmtMes(m)}</button>
    ))}
  </div>
  <div className="segmented">{/* Sin IVA / Con IVA si aplica */}</div>
</div>
<div className="section-title">Viajes de {fmtMes(mes)}</div>
<div className="table-wrap table-scroll">
  <table className="clean">…filas filtradas por mes, con fila Total en var(--surface-2)…</table>
</div>
```

Alternativa compacta si hay >8 meses: `<label className="field">Mes<input type="month" className="input" …/></label>`
(patrón RecaudoClient).

### 7.3 Formulario grande de registro (viaje/factura)

Primera opción: **formulario inline colapsable** del §3.7 (así lo hace el módulo hermano). Si el
usuario pide modal explícitamente, usa el modal propuesto del §3.8 con el mismo grid interno:
`repeat(auto-fit, minmax(160px, 1fr))` para campos escalares y filas de ítems con grid de columnas
fijas + botón "+ Agregar ítem" + subtotal/IVA/total a la derecha + `btn-primary` de guardado.

### 7.4 Semáforo de vencimiento (rojo vencido / ámbar ≤30 días)

```tsx
const HOY = new Date();
function diasParaVencer(fecha: string) {
  return Math.floor((new Date(fecha + "T00:00:00").getTime() - HOY.getTime()) / 86400000);
}
function vencCls(dias: number) {
  return dias < 0 ? "high" : dias <= 30 ? "warn" : "ok";  // rojo vencido / ámbar ≤30 / verde
}
// en la celda:
<td>
  <span className={`badge ${vencCls(d)}`}>
    {d < 0 ? `Vencida hace ${-d} días` : d === 0 ? "Vence hoy" : `Vence en ${d} días`}
  </span>
  <span className="cc-dias">{fdate(r.fecha_vencimiento)}</span>
</td>
// y el filete en la fila: <tr className={`sem-${vencCls(d)}`}> dentro de <table className="clean cartera">
```

(Es el mismo esquema que `agingCls` de PrefacturasClient, invertido hacia futuro.)

### 7.5 Barra de progreso de contrato

Barra grande en tarjeta:

```tsx
<div className="chart-card">
  <div className="chart-title">Avance del contrato IS No. 04-2026</div>
  <div className="chart-sub">facturado acumulado sobre el valor del contrato</div>
  <Bar label="Facturado" value={facturado} total={valorContrato} />
  <Bar label="Facturado + pendiente" value={facturado + pendiente} total={valorContrato} />
</div>
```

Versión compacta en KPI o celda: `bar-track` (+ `style={{ height: 14 }}` en tabla) con `bar-fill`
condicional `full` (verde ≥100%) o roja si excede
(`style={{ background: "var(--high)" }}` cuando `p >= 100`, patrón indirectos de AaaClient).
Acompaña siempre con el % numérico (`bar-pct` o `badge`).

### 7.6 Checklist de "se ve nativo"

- [ ] Sin `.container` propio; la página empieza en `page-head`.
- [ ] Cero colores hex nuevos: solo `var(--…)`.
- [ ] Números a la derecha con `num`/`tabular-nums`; moneda con `COP.format`; vacíos con "—".
- [ ] Tablas dentro de `table-wrap table-scroll`; KPIs en `.kpis`; secciones con `section-title`.
- [ ] Tabs = `segmented/seg`, no componentes nuevos; estados = `badge ok|warn|mid|high`.
- [ ] Iconos de `app/icons.tsx` (añadir ahí los que falten, mismo estilo de línea 1.7).
- [ ] Sin librerías nuevas (ni gráficas, ni toasts, ni UI kits).

---

## 8. Contratos de la base (Cimiento)

Base común del módulo nativo `/aaa/transporte`, ya construida en `lib/transporte/` y
`app/aaa/transporte/`. Los cuatro constructores de vistas SOLO reemplazan su stub
(`ResumenView.tsx`, `RegistrosView.tsx`, `TarifarioView.tsx`, `ReportesView.tsx`,
`FlotaView.tsx`, `PersonalView.tsx`, `AdminView.tsx`) — no tocan el hook, el shell ni la API.

### 8.1 Persistencia (Supabase, NO Firebase)

- Tabla clave-valor `transporte_kv` (`supabase/transporte_kv.sql`), claves
  `adminconfig` | `tarifario` | `services:AAAA-MM`, valor SIEMPRE string JSON.
- Ruta API `app/api/aaa/transporte/route.ts` (`GET ?key=` / `GET ?list=1` / `POST {key,value}` /
  `DELETE ?key=`), vía `supabaseAdmin()`.
- Cliente: `lib/transporte/storage.ts` (`kvGet/kvSet/kvDelete/kvList`, `loadMonth/saveMonth`
  con límites de peso: aviso confirmable a 8 MB — `SAVE_WARN_CHARS` — y bloqueo configurable
  a 20 MB — `SAVE_BLOCK_CHARS` en `constants.ts`; Supabase no impone el tope de Firebase).
- Sin credenciales Supabase → **modo demo**: Map en memoria + seeds (`t.demo === true`).
- Migración de datos reales (una sola vez): `npx tsx scripts/migrar-transporte.ts`.

### 8.2 Hook central — `useTransporte()` (`@/lib/transporte/useTransporte`)

El shell (`TransporteClient`) lo instancia UNA vez y lo inyecta a cada vista como
`{ t }: ViewProps`. Nunca llames `useTransporte()` dentro de una vista.

| Miembro | Tipo / uso |
|---|---|
| `loading · error · demo · saving · lastSyncAt` | estado de carga y sincronización (badge con `syncLabel(t)`) |
| `admin` | `AdminConfig \| null` — perfiles, listas maestras, festivos custom, vigencia |
| `tarifario` | `Tarifario \| null` |
| `months` | `MonthInfo[]` de la vigencia (`{year, month, key:'AAAA-MM', label}`) |
| `servicesByMonth` | `Record<monthKey, Servicio[]>` — todos los meses cargados |
| `activeMonthIdx · setActiveMonthIdx · activeMonth · activeServices` | mes activo (pestañas de Registros) |
| `contractStart · contractEndExclusive · status` | vigencia y `{label, activo, pctTiempo}` |
| `setModalOpen(bool)` | **OBLIGATORIO** al abrir/cerrar todo modal/drawer: pausa el polling (12 s; cada 5.º tick recarga todos los meses) |
| `refresh()` | recarga completa manual |
| `upsertService(monthKey, item)` | alta/edición optimista con revert; aplica límites de peso; `throw Error` con mensaje legible → mostrarlo inline (§3.9) |
| `deleteService(monthKey, id)` | la vista pide el `confirm` del SPEC antes de llamar |
| `toggleInvoiced(monthKey, id)` | botón-badge Facturado/Pendiente |
| `markInvoiced(pairs)` | tras exportar (`[{monthKey, id}]`) |
| `saveTarifarioCfg(t) · resetTarifario()` | vista Tarifario |
| `saveAdminCfg(mutator)` | muta una COPIA del admin y persiste: `await t.saveAdminCfg(a => { a.areas.push(x); })` |
| `downloadBackup() · restoreFromBackup(payload)` | copia de seguridad formato SPEC §2.4 (restaurar devuelve nº de bloques) |

### 8.3 Sesión y aprobación — `@/lib/transporte/session`

**Decisión AG: identidad por login de plataforma (Supabase Auth); aislamiento por rol.**
El módulo NO pide claves ni muestra selectores de perfil: `session.tsx` consume el ROL
del usuario logueado en la plataforma. El login YA está construido:

- **Tabla `usuarios`** (`supabase/usuarios.sql`): `id` (= auth.users), `email`, `nombre`,
  `rol` (`gerencia`|`renzo`|`jesus`; gerencia = administrador total) + RLS (cada uno lee
  solo su fila). Cuentas: `scripts/crear-usuarios.ts` (service role; sin registro público).
- **Middleware** (`middleware.ts`, @supabase/ssr con cookies): protege TODAS las rutas
  (páginas → redirect a `/login?next=…`; `/api` → 401 JSON salvo cron de Vercel o
  `CARTERA_SYNC_SECRET`). Supabase sin configurar → deja pasar (modo demo).
- **`/login`** (`app/login/page.tsx`): email + contraseña, errores inline en español,
  estilos `.login-*` de globals.css. Con sesión, `/login` redirige a `/`.
- **Sesión en UI** (`lib/auth/useUsuario.tsx`): `<UsuarioProvider>` en el layout raíz;
  `useUsuario()` → `{ usuario: {id, email, nombre, rol} | null, cargando, cerrarSesion }`.
  Lee Auth + tabla `usuarios` (y reacciona a `onAuthStateChange`); en modo demo devuelve
  un usuario demo rol gerencia. AppShell muestra nombre + rol y "Cerrar sesión" en el pie
  de la barra lateral (`ROL_LABELS` exporta los labels legibles).
- **Transporte**: `currentProfile = usuario.rol` (mientras carga o sin fila en `usuarios`
  se asume `jesus`, mínimo privilegio — nunca gerencia por defecto). `approve()` sella
  `approvedBy` con el **nombre real** del usuario logueado (label del perfil como respaldo).

- `useTransporteSession()` (el Provider ya envuelve las vistas): `currentProfile`
  (`PerfilKey`, nunca null), `profileCan(sec)`, `profileCanFor(perfil, sec)`,
  `canEditFleet()`, `canEditPersonal()`, `approve()`, `profileLabel(k)`.
- **Sello de registro** (sin clave): todo guardado de servicio estampa el rol activo
  ```tsx
  const r = ses.approve();                                // usa el rol de la sesión
  await t.upsertService(mesKey, { ...item, ...r.stamp }); // approvedBy/approvedByKey/approvedAt
  ```
  El formulario de servicio muestra "Se registrará como: <perfil>" (sin campos de
  perfil + clave).
- **Aislamiento por rol** (matriz `perms` de adminconfig): gerencia ve y puede todo;
  renzo/jesus solo las secciones habilitadas. En AdminView las secciones exclusivas de
  gerencia (vigencia, matriz de permisos, backup) se OCULTAN para los demás. Flota y
  Personal sin permiso: tabla en solo lectura, sin formulario ni acciones. Todo se activa
  con solo cambiar la fuente de `currentProfile` a la sesión real.
- El campo `password` de los perfiles persiste en los datos por compatibilidad, pero
  nada lo usa ni lo muestra. Ya no existe `<AdminGate>`.

### 8.4 Lógica pura — `@/lib/transporte/logic`

`fmtCOP · COP · fmtShort · fdate · fmtF · fmtMes · slugify` (formato es-CO) ·
`monthKey · applyContractDates · currentMonthIdx · contractStatus` ·
`respHours(hourReq, hourAtt)` · `autoRecargos({date, hourReq, hourAtt, …touched, admin})`
(respeta flags touched; devuelve `{nocturno, dominical, nota}`) ·
`computeValor(tarifario, catId, rutaId, noct, dom)` (→ `{capacidad, total, hint}` o null si manual) ·
`tarifaDescriptionFor` · `diasParaVencer · vencCls` (semáforo rojo/ámbar ≤30 d/verde) ·
`computeAlertas(servicesByMonth, admin)` + `ALERTAS_MAX(8)` + `ALERTAS_VACIO` ·
`collectAllItems · totales`. Modelo y normalizadores en `@/lib/transporte/model`
(`num()`, `areaAAADe()`, `aprobadorDe()` — SIEMPRE leer área/aprobador con estos helpers
por los alias legados `areaSolicitante`/`aprobadoPor`; `nuevoServicioId()`).

### 8.5 Adjuntos — `@/lib/transporte/media`

`processSelectedFile(File)` → `{file: AdjuntoFile, warning}` (rechaza >20 MB, comprime
imágenes a 900 px JPEG 0.62, avisa PDFs >3 MB) · `compressImage · readFileAsDataURL ·
openAttachment(file)` (pestaña nueva vía Blob URL) · `dataUrlBytes · fmtBytes`.

### 8.6 Exportaciones

`pdf-lib` y `xlsx` YA están instaladas — impórtalas dinámicamente
(`const { PDFDocument } = await import("pdf-lib")`) para no engordar el bundle inicial.
Chart.js queda descartado: toda gráfica es divs CSS (§4) o SVG inline.

### 8.7 Reglas para las vistas

1. Props EXACTAS: `export function XView({ t }: ViewProps)` — sin props nuevas; estado local libre.
2. `t.setModalOpen(true/false)` en cada modal/drawer, sin excepción.
3. Errores de guardado: `try/catch` alrededor de las mutaciones y mensaje inline (§3.9); el hook ya hizo el revert.
4. Nada de librerías nuevas ni hex sueltos; clases de `globals.css` (prefijo `.tx-` solo si es imprescindible, al final del archivo).
5. Textos en español, sin emojis; iconos de `app/icons.tsx`.
