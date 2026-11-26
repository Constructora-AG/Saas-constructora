# Constructora Anaya Giraldo — instrucciones para Codex

Estas instrucciones son las reglas generales del proyecto. Aplícalas en todas las tareas y combínalas con las reglas específicas de la ruta o tipo de archivo que estés modificando.

La fuente global canónica compartida con Codex y Claude Code es `.ai/instructions/project.instructions.md`. Léela cuando necesites confirmar o actualizar las reglas generales. Este archivo repite esas reglas esenciales porque Codex carga `AGENTS.md` como su memoria de proyecto.

Las instrucciones adicionales de `.ai/instructions/` y los agentes de `.ai/agents/` son especializadas: aplícalas solo cuando la ruta o la tarea corresponda.

## Contexto técnico

- La aplicación usa Next.js con App Router, React, TypeScript y Supabase.
- Mantén la separación entre componentes Server y Client de Next.js; usa `'use client'` únicamente cuando haya estado, efectos, eventos del navegador o APIs del cliente.
- Respeta la estructura existente de `app/`, `public/` y `supabase/` antes de crear nuevas carpetas o abstracciones.
- Conserva el idioma español y el contexto de negocio de Constructora Anaya Giraldo salvo que la tarea indique lo contrario.

## Cambios de código

- Inspecciona primero los patrones existentes y reutiliza componentes, tipos, tokens de diseño y helpers disponibles.
- Haz cambios pequeños y localizados; no reescribas archivos completos para corregir un problema puntual.
- Usa TypeScript estricto y evita `any`; define tipos explícitos para datos de APIs, Supabase y props de componentes.
- No ocultes errores con `as any`, `@ts-ignore` o manejo silencioso de excepciones.
- Mantén nombres, formato y convenciones ya usadas en el archivo que modificas.
- No introduzcas dependencias nuevas si la funcionalidad puede resolverse con las dependencias actuales.
- No refactorices, limpies ni cambies estilo en código que la tarea no toca.
- Para datos que dependen de versiones (APIs de Next.js, Supabase, librerías), verifica la versión en `package.json` y la documentación vigente en lugar de confiar en conocimiento general.

## Seguridad y datos

- Nunca expongas secretos, claves privadas o valores de `.env.local` en el código, logs o respuestas.
- Valida entradas en rutas API y conserva la autorización existente antes de leer o modificar datos.
- No cambies el esquema SQL, políticas RLS o migraciones sin revisar el impacto en las rutas y clientes que las consumen.
- No inventes campos, endpoints o contratos de datos: verifica sus definiciones en el código o en `supabase/`.

## Reglas de interfaz web

Estas reglas aplican al modificar `app/**/*.tsx`, `app/**/*.css` o `app/**/*.ts`:

- Reutiliza los tokens y componentes visuales existentes en `app/globals.css` antes de crear colores, sombras o radios nuevos.
- Conserva la identidad visual sobria azul institucional y el idioma español.
- Usa HTML semántico y controles nativos siempre que sea posible; añade ARIA solo cuando resuelva una necesidad real.
- Todo control interactivo debe tener nombre accesible, foco visible y funcionamiento con teclado.
- No uses color como único indicador de estado; acompaña estados con texto, icono o una etiqueta comprensible.
- Mantén contraste suficiente y evita eliminar `outline` sin reemplazo equivalente.
- Diseña para pantallas pequeñas, zoom y contenido variable.
- En componentes Client, gestiona estados de carga, error, vacío y permisos de forma explícita.
- Evita efectos que dependan únicamente de hover y respeta `prefers-reduced-motion` cuando agregues animación.
- Criterios WCAG 2.2 AA: objetivos táctiles de al menos 24×24 px, foco no oculto por elementos fijos y alternativa con clic o teclado para toda acción de arrastre.

## Reglas especializadas adicionales

Lee el archivo correspondiente antes de trabajar en estas áreas:

- Next.js App Router (`app/**`): `.ai/instructions/nextjs.instructions.md`. El proyecto usa Next.js 15.5: `params` y `cookies()` son asíncronos y no se usan APIs exclusivas de Next.js 16.
- Seguridad (`app/api/**`, `lib/**`, `middleware.ts`, `supabase/**`): `.ai/instructions/security.instructions.md`. Toda ruta API autoriza al inicio con `lib/auth/servidor.ts` o `lib/sync/auth.ts`.
- Comentarios en el código: `.ai/instructions/code-comments.instructions.md`. Comenta el porqué, no el qué.
- Mensajes de commit: `.ai/instructions/commits.instructions.md`. Formato `tipo(alcance): resumen` en español, presente, minúscula inicial, sin punto final y máximo 72 caracteres.
- Revisión de código: `.ai/agents/code-review.agent.md`.

## Reglas para correos HTML

Estas reglas aplican al modificar `public/auth-emails/**/*.html`:

- Conserva los placeholders del proveedor de correo, por ejemplo `{{ .ConfirmationURL }}`.
- Prioriza tablas de presentación, estilos inline y compatibilidad con Outlook, Gmail y clientes móviles.
- No dependas de JavaScript, fuentes externas ni CSS moderno imprescindible.
- Conserva el `lang` correcto, el título, la jerarquía del contenido y los enlaces con texto comprensible.
- Revisa contraste, legibilidad móvil y funcionamiento con lectores de pantalla.
- La acción principal debe ser clara, visible, táctil y tener una alternativa visible para copiar y pegar el enlace.
- No dependas únicamente del color para comunicar estados o acciones.
- No inventes URLs ni modifiques placeholders dinámicos.
- Mantén el tono, idioma e identidad visual existentes salvo que la tarea indique lo contrario.

## Verificación

- Después de cambios relevantes, ejecuta la comprobación más cercana disponible: TypeScript, build, lint o smoke test.
- Revisa estados de carga, vacío, error, permisos y responsive cuando cambies una pantalla o flujo de usuario.
- Para correos HTML, inspecciona también la estructura, los enlaces dinámicos y la compatibilidad visual en móvil.
- Resume los archivos modificados, los riesgos y las verificaciones realizadas.
