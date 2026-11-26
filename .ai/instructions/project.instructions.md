---
description: 'Reglas generales de desarrollo para la aplicación SaaS de Constructora Anaya Giraldo.'
applyTo: '**/*'
---

# Reglas generales del proyecto

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

## Verificación

- Después de cambios relevantes, ejecuta la comprobación más cercana disponible: TypeScript, build, lint o smoke test.
- Revisa estados de carga, vacío, error, permisos y responsive cuando cambies una pantalla o flujo de usuario.
- Resume los archivos modificados, los riesgos y las verificaciones realizadas.
