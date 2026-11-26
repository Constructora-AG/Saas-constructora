# Constructora Anaya Giraldo — instrucciones para Claude Code

Las instrucciones globales canónicas del proyecto están en:

@.ai/instructions/project.instructions.md

Las reglas de compatibilidad para Codex y las reglas especializadas del proyecto están en:

@AGENTS.md

Aplica las reglas especializadas según la ruta:

- Para `app/**/*.tsx`, `app/**/*.css` y `app/**/*.ts`:
  @.ai/instructions/web-ui.instructions.md
  @.ai/instructions/nextjs.instructions.md
- Para `app/api/**`, `lib/**`, `middleware.ts` y `supabase/**`:
  @.ai/instructions/security.instructions.md
- Al escribir o editar comentarios en el código:
  @.ai/instructions/code-comments.instructions.md
- Al crear commits o redactar mensajes de commit:
  @.ai/instructions/commits.instructions.md
- Al revisar código, sigue `.ai/agents/code-review.agent.md`.
- Para `public/auth-emails/**/*.html`:
  @.ai/agents/email-accessibility.agent.md
- Para archivos de autenticación como `lib/auth/invitationCallback.ts`, conserva la validación estricta de URLs, no expongas variables de entorno y verifica los consumidores existentes antes de cambiar contratos o aliases de compatibilidad.
