# Seguridad

Subconjunto adaptado de [`security-and-owasp.instructions.md`](https://github.com/github/awesome-copilot/blob/main/instructions/security-and-owasp.instructions.md) (OWASP Top 10 2025) para Next.js App Router + Supabase. Aplica a `app/api/**`, `lib/**`, `middleware.ts` y cualquier código que lea datos, archivos o variables de entorno.

## Autorización en rutas API

- Toda Route Handler nueva en `app/api/**` debe autorizar **al inicio**, antes de leer el cuerpo o consultar datos:
  - Usuarios: `exigirModulo`, `exigirCualquieraDeModulos` o `exigirRol` de `lib/auth/servidor.ts`, y devolver la respuesta si `esRespuestaAutorizacion(...)` es verdadero.
  - Crons y sincronizaciones: `syncAutorizado` de `lib/sync/auth.ts`. No confíes en encabezados como `x-vercel-cron`.
- La autorización de la UI (ocultar botones, `useUsuario`) es solo cosmética; la decisión real ocurre en el servidor.
- `supabaseAdmin()` usa la service role y **omite RLS**: cuando lo uses, filtra explícitamente por el alcance del usuario (proyecto, módulo, contrato) en lugar de confiar en el `id` recibido.
- **IDOR**: si la ruta recibe un `id`, verifica que el recurso pertenece a algo que el usuario puede ver antes de devolverlo o modificarlo.
- **Asignación masiva**: no pases `await req.json()` directamente a `insert`/`update`. Construye el objeto con los campos permitidos (como hace `buildLeadInput`). Nunca aceptes `rol`, `modulos`, `created_by` ni campos de auditoría desde el cliente.

## Validación de entradas

- Valida tipo, formato y rango de `searchParams`, `params` y cuerpo (por ejemplo `periodo=YYYY-MM`) y responde `400` con un mensaje claro si no cumple. Usa funciones de validación propias; no agregues librerías nuevas para esto.
- Construye consultas con el query builder de Supabase; no concatenes texto del usuario en filtros `.or()`, `.filter()` ni en SQL de funciones RPC.
- **SSRF**: no hagas `fetch` a URLs que provengan del usuario. Si es inevitable, valida esquema `https:` y host contra una lista permitida (ver `lib/auth/invitationCallback.ts`).
- **Path traversal**: las rutas de Storage se construyen con identificadores validados; rechaza `..`, `/` iniciales y caracteres de control en nombres de archivo.
- Para archivos subidos (Excel, PDF), limita tamaño y tipo antes de procesarlos y no ejecutes contenido del archivo.

## Secretos y variables de entorno

- Solo las variables `NEXT_PUBLIC_*` pueden llegar al cliente, y se incrustan en el build. Nunca uses ese prefijo para llaves privadas.
- `SUPABASE_SERVICE_ROLE_KEY`, `*_SYNC_SECRET`, `CRON_SECRET` y credenciales de Smarthome solo se leen en archivos de servidor (`lib/supabase/server.ts`, Route Handlers). No importes esos módulos desde componentes `'use client'`.
- Si falta una variable privilegiada, falla con error; no hagas fallback a la anon key ni a valores por defecto.
- Prefiere secretos en el encabezado `Authorization: Bearer`; no generes enlaces nuevos con secretos en la query string (quedan en logs).
- No escribas secretos, tokens ni datos personales de clientes en `console.log`.

## Respuestas de error

- Devuelve mensajes genéricos al cliente (`{ error: "No autorizado" }`, `{ error: "Error al consultar la cartera" }`); deja el detalle técnico en el log del servidor.
- No devuelvas stack traces, mensajes crudos de PostgREST con nombres de tablas sensibles, ni datos de otros usuarios.
- Usa códigos correctos: `400` entrada inválida, `401` sin sesión, `403` sin permiso, `404` no existe o no es visible, `500` error interno.

## Frontend

- Evita `dangerouslySetInnerHTML`. Si es imprescindible, el contenido debe ser generado por el servidor y nunca contener texto del usuario sin escapar.
- No uses `eval`, `new Function` ni `setTimeout` con strings.
- Valida destinos de redirección internos (ver `destinoInterno`) para evitar open redirects.
- No guardes tokens ni datos sensibles en `localStorage`; la sesión la maneja `@supabase/ssr` con cookies.

## Cabeceras HTTP

Antes de modificar `next.config.mjs` o `vercel.json`, ten en cuenta las cabeceras recomendadas: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (o `frame-ancestors` en CSP), `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy`. Agregar una CSP requiere probar los flujos de Supabase y Smarthome antes de desplegar. Nunca combines `Access-Control-Allow-Origin: *` con credenciales.

## Base de datos

- Las tablas nuevas en `supabase/` deben tener RLS habilitado, aunque la app use service role, para que la anon key no exponga datos.
- Las funciones `security definer` deben fijar `search_path` y validar el usuario que llama.
