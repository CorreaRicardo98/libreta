# Accesibilidad de Libreta

Estado de la revisión de accesibilidad (issue #10). Este documento distingue lo que **se comprobó** de lo que **falta comprobar con un lector de pantalla real**.

## Cómo se probó

Hasta ahora **sin lector de pantalla**: con el árbol de accesibilidad de Chromium (el que leen NVDA y Orca), eventos de teclado reales sobre la app y lectura del DOM. Eso detecta nombres, roles, estados y manejo del foco, pero **no sustituye** oír cómo suena en NVDA (Windows) u Orca (Linux).

Sistema: Linux, Electron 44. Lector de pantalla: ninguno todavía.

## Corregido

| Problema | Qué se hizo |
| --- | --- |
| Los diálogos no atrapaban el foco | `Tab` y `Mayús+Tab` ciclan dentro del diálogo (16 pulsaciones seguidas, 0 escapes) |
| Al cerrar un diálogo el foco se perdía | Vuelve al control que lo abrió |
| Los diálogos no tenían nombre | `aria-labelledby` apunta a su título |
| El fondo seguía accesible con un diálogo abierto | `inert` en la app mientras haya un diálogo |
| Un diálogo sin foco inicial lo dejaba fuera | Si no enfoca nada, el foco entra en el primer control |
| Los menús no devolvían el foco | Al cerrarse, el foco vuelve al botón que los abrió |
| Las listas de la barra lateral no tenían nombre | Cada `<nav>` se anuncia como *Todas las notas*, *Inteligentes*, *Carpetas* y *Etiquetas* |
| El número de notas no se anunciaba | El contador de la lista es una región `status` (`aria-live`), así que buscar o cambiar de carpeta lo anuncia |
| Las sugerencias de `[[` no se asociaban al editor | El editor expone `aria-controls`, `aria-expanded`, `aria-autocomplete` y `aria-activedescendant` mientras la lista está abierta |
| Las tarjetas de adjunto no tenían nombre | Grupo con nombre y tamaño; el botón dice *Abrir «archivo»* |

## Ya estaba bien

- Botones de la barra con nombre accesible, `aria-pressed` y `aria-haspopup`.
- La nota abierta se marca con `aria-current` en la lista; el toast es `role="status"`; los errores de formulario son `role="alert"`.
- Menús con `role="menu"`, `menuitem`/`menuitemradio` y flechas.

## Pendiente (necesita una persona con lector de pantalla)

- [ ] Recorrer la app con **NVDA** (Windows) y **Orca** (Linux) y anotar qué se anuncia mal.
- [ ] Comprobar cómo se lee la lista de notas: cada nota es un botón cuyo nombre incluye título, hora y vista previa; puede ser demasiado largo.
- [ ] Comprobar la galería de tarjetas y el cambio de vista (lista/galería).
- [ ] Comprobar el editor: anuncio de listas de tareas, tablas, enlaces `[[ ]]` y notas bloqueadas.
- [ ] Contraste de color en los seis colores de acento y en el tema oscuro.

Si pruebas con un lector de pantalla, abre un issue con el sistema, el lector y lo que oíste: es la contribución más útil que se puede hacer aquí.
