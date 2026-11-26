# Next.js (App Router)

Adaptado de [`nextjs.instructions.md`](https://github.com/github/awesome-copilot/blob/main/instructions/nextjs.instructions.md). El original está escrito para Next.js 16; este proyecto usa **Next.js 15.5 y React 19**. Antes de aplicar una API, verifica la versión en `package.json` y la documentación oficial correspondiente.

## Server y Client Components

- Los componentes son de servidor por defecto. Agrega `'use client'` solo con estado, efectos, eventos o APIs del navegador.
- Mantén `'use client'` lo más abajo posible del árbol: extrae la parte interactiva a un componente pequeño e impórtalo desde el componente de servidor.
- No uses `next/dynamic` con `{ ssr: false }` dentro de un Server Component; muévelo a un Client Component.
- Un Client Component no puede importar módulos de servidor (`lib/supabase/server.ts`, `lib/auth/servidor.ts`, clientes de Smarthome). Pasa datos serializables como props.

## APIs de request asíncronas

- `params` y `searchParams` en páginas, layouts y Route Handlers son `Promise`: tipa como `{ params: Promise<{ id: string }> }` y usa `await params`.
- `cookies()` y `headers()` son asíncronas: `const store = await cookies()`.
- Leer cookies, headers o `searchParams` vuelve la ruta dinámica; hazlo solo donde se necesita.

## Route Handlers

- Ubícalas en `app/api/<modulo>/route.ts` y exporta funciones por verbo (`GET`, `POST`, …) con `NextRequest`/`NextResponse`.
- Autoriza primero y valida entradas después (ver `security.instructions.md`).
- Para procesos largos (sincronizaciones) declara `export const maxDuration` y pagina las lecturas de PostgREST (máximo 1000 filas por consulta).
- **No llames a tus propias rutas API desde Server Components** (`fetch('/api/...')`). Extrae la lógica a `lib/<modulo>/` y llámala directamente.
- La lógica de negocio pura (cálculos de cartera, prefacturas, informes) va en `lib/` para poder probarla con `node --test` sin Next.js.

## Datos y caché

- En Next.js 15, `fetch` y las Route Handlers `GET` **no** se cachean por defecto. Si necesitas caché, decláralo de forma explícita (`export const revalidate`, `cache: 'force-cache'`) y documenta por qué.
- No uses las APIs exclusivas de Next.js 16 (`cacheComponents`, `'use cache'`, `cacheLife`, `revalidateTag(tag, 'max')`, `updateTag`) mientras el proyecto siga en la versión 15.
- Tras una mutación desde el cliente, refresca los datos con el mecanismo que ya use la pantalla (recarga del hook, `router.refresh()`), sin introducir otro patrón.

## Estructura y nombres

- Respeta la estructura existente: rutas en `app/`, lógica en `lib/<modulo>/`, pruebas en `tests/<modulo>/`, SQL en `supabase/`.
- Componentes en `PascalCase`, hooks `useAlgo`, utilidades en `camelCase`. Mantén nombres en español como el resto del código.
- Usa segmentos dinámicos (`[id]`) y carpetas privadas (`_componentes`) en lugar de lógica de enrutamiento manual.
- No crees archivos de ejemplo o demo salvo que se pidan.

## Rendimiento

- Mantén las librerías pesadas (`exceljs`, `xlsx`, `pdf-lib`) en el servidor o cárgalas con `import()` dinámico solo cuando el usuario las necesite.
- Usa `loading.tsx` o `Suspense` para estados de carga de páginas de servidor.
- Usa `next/image` para imágenes de contenido y `next/font` si se agregan fuentes.

## Verificación

- `npx tsc --noEmit` para tipos, `npm test` para pruebas y `npm run build` cuando cambien rutas, configuración o la frontera Server/Client.
