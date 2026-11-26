# Mensajes de commit

Adaptado de la skill comunitaria [`git-commit`](https://github.com/github/awesome-copilot/blob/main/skills/git-commit/SKILL.md) (Conventional Commits 1.0.0) para Constructora Anaya Giraldo.

## Formato

```text
<tipo>(<alcance>): <resumen>

<cuerpo opcional>

<pie opcional>
```

- Escribe el mensaje en **español**.
- El resumen va en **minúscula inicial**, en **presente de indicativo, tercera persona** («agrega», «corrige», «refactoriza»), no en infinitivo («agregar») ni con sustantivos («Incorporación de»).
- Primera línea de **72 caracteres o menos**, **sin punto final**.
- El alcance es opcional; si se omite, usa `<tipo>: <resumen>`.
- El cuerpo explica **qué cambió y por qué**, no cómo. Sepáralo del resumen con una línea en blanco.
- Si el resumen necesita «y» para unir dos cambios distintos, probablemente son dos commits.

## Tipos

| Tipo       | Uso                                                        |
| ---------- | ---------------------------------------------------------- |
| `feat`     | Funcionalidad nueva visible para el usuario                |
| `fix`      | Corrección de un error                                     |
| `refactor` | Cambio de código que no agrega funcionalidad ni corrige    |
| `perf`     | Mejora de rendimiento                                      |
| `style`    | Solo formato o estilos de código, sin cambio de lógica     |
| `test`     | Pruebas nuevas o modificadas (no uses `feat(tests)`)       |
| `docs`     | Solo documentación (`*.md`, comentarios)                   |
| `build`    | Dependencias, `package.json`, configuración de Next.js     |
| `ci`       | Integración continua, `vercel.json`                        |
| `chore`    | Mantenimiento que no encaja en los anteriores              |
| `revert`   | Revierte un commit anterior                                |

## Alcances

Usa una sola palabra en minúsculas, sin espacios ni tildes, que corresponda a un módulo del proyecto:

`cartera`, `smarthome`, `prefacturas`, `aaa`, `transporte`, `recoleccion`, `marketing`, `vendedores`, `eventos`, `cuotas`, `leads`, `asistente`, `auth`, `usuarios`, `sync`, `emails`, `supabase`, `ui`, `instructions`.

Si un alcance nuevo es necesario, sigue el nombre de la carpeta en `app/` o `lib/`. Para sub-áreas, prefiere detallarlas en el resumen en lugar de alcances compuestos (`fix(recoleccion): …tarifario…`, no `fix(contrato de recoleccion-tarifario)`).

## Cambios incompatibles

Agrega `!` antes de los dos puntos y un pie `BREAKING CHANGE:` cuando cambie un contrato de API, una tabla o política de Supabase, o una variable de entorno requerida:

```text
feat(cartera)!: separa el informe mensual por proyecto

BREAKING CHANGE: GET /api/cartera/informes exige el parámetro projectCode.
```

## Ejemplos

```text
feat(cartera): agrega referencia Smarthome al informe mensual
fix(transporte): corrige el sondeo duplicado en useTransporte
refactor(auth): extrae la validación de URL de destinoInterno
test(prefacturas): cubre las transiciones de estado inválidas
docs(instructions): agrega reglas de mensajes de commit
build: actualiza next a 15.5.19
```

Evita: `feat: Incorporación del módulo «Recolección»` (sustantivo y mayúscula), `fix: mejora … .` (punto final), `Proyecto Triple A: …` (sin tipo), mensajes en inglés.

## Flujo para agentes

1. Revisa `git status`, `git diff` y `git diff --staged`; consulta `git log --oneline -10` para mantener el estilo.
2. Un cambio lógico por commit. Agrega archivos por ruta (`git add -- <rutas>`); no uses `git add -A` a ciegas ni modos interactivos.
3. No incluyas `.env*`, credenciales, llaves ni exportaciones de datos de clientes.
4. Para varios párrafos usa varios `-m` o `git commit -F <archivo>`.
5. No uses `--no-verify`, `--amend`, `rebase` ni `push` salvo que el usuario lo pida. Haz commit solo cuando el usuario lo solicite.
