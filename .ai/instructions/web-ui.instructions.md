---
description: 'Criterios de accesibilidad, consistencia visual y experiencia responsive para la interfaz web de la aplicación.'
applyTo: 'app/**/*.tsx, app/**/*.css, app/**/*.ts'
---

# Interfaz web

- Reutiliza los tokens y componentes visuales existentes en `app/globals.css` antes de crear colores, sombras o radios nuevos.
- Conserva la identidad visual sobria azul institucional y el idioma español.
- Usa HTML semántico y controles nativos siempre que sea posible; añade ARIA solo cuando resuelva una necesidad real.
- Todo control interactivo debe tener nombre accesible, foco visible y funcionamiento con teclado.
- No uses color como único indicador de estado; acompaña estados con texto, icono o una etiqueta comprensible.
- Mantén contraste suficiente entre texto, fondos, bordes y estados; evita eliminar `outline` sin reemplazo equivalente.
- Diseña para pantallas pequeñas, zoom y contenido variable; las tablas y formularios no deben romper el flujo horizontal sin una alternativa.
- En componentes Client, gestiona estados de carga, error, vacío y permisos de forma explícita.
- Evita efectos que dependan únicamente de hover y respeta `prefers-reduced-motion` cuando agregues animación.
