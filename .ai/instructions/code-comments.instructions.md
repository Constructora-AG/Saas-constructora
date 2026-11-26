# Comentarios en el código

Adaptado de [`self-explanatory-code-commenting.instructions.md`](https://github.com/github/awesome-copilot/blob/main/instructions/self-explanatory-code-commenting.instructions.md).

## Principio

Escribe código que se explique solo. Comenta **por qué**, no **qué**. Si un nombre mejor elimina la necesidad del comentario, cambia el nombre.

## Evita

- Comentarios obvios o que repiten el código (`// incrementa el contador`).
- Comentarios desactualizados: si cambias la lógica, actualiza o borra el comentario en el mismo cambio.
- Código comentado: bórralo; el historial de git lo conserva.
- Comentarios de historial («cambiado el 12/03 por…», «antes se hacía X»), salvo que expliquen una restricción vigente.
- Separadores decorativos y comentarios de cierre de bloque.

## Escribe comentarios para

- **Reglas de negocio**: cálculos de cartera, mora, recaudo, tarifas o prefacturas cuyo motivo no es evidente (`// Separaciones de Lotes Reserva del Manantial no cuentan como recaudo`).
- **Restricciones externas**: límites de PostgREST, Smarthome o Vercel (`// PostgREST devuelve máximo 1000 filas por consulta`).
- **Decisiones de seguridad**: por qué se valida o no se confía en algo (`// No se confía en x-vercel-cron: cualquiera puede enviarlo`).
- **Expresiones regulares** y formatos de datos no obvios.
- **Encabezado de Route Handlers**: método, parámetros, módulo requerido y propósito, como en `app/api/cartera/informes/referencia/route.ts`.
- **APIs exportadas de `lib/`** con contratos no evidentes: un JSDoc breve (`/** … */`) con lo que recibe, devuelve o lanza.

## Marcadores

- `TODO:` y `FIXME:` solo con una descripción accionable; no los dejes como sustituto de terminar la tarea.
- `HACK:` o `NOTA:` cuando se esquiva una limitación externa, indicando cuál.

## Idioma

Escribe los comentarios en español, con el mismo tono del archivo.
