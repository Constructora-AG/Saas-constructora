# Constructora Anaya Giraldo — instrucciones para Claude Code

Las instrucciones globales canónicas del proyecto están en:

@.ai/instructions/project.instructions.md

Las reglas de compatibilidad para Codex y las reglas especializadas del proyecto están en:

@AGENTS.md

Aplica las reglas especializadas según la ruta:

- Para `app/**/*.tsx`, `app/**/*.css` y `app/**/*.ts`, consulta `.ai/instructions/web-ui.instructions.md`.
- Para `public/auth-emails/**/*.html`, consulta `.ai/agents/email-accessibility.agent.md`.
- Para archivos de autenticación como `lib/auth/invitationCallback.ts`, conserva la validación estricta de URLs, no expongas variables de entorno y verifica los consumidores existentes antes de cambiar contratos o aliases de compatibilidad.
