# Historial de cambios

Todas las versiones notables de Libreta. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]
### Agregado
- **Plantillas de nota.** «Nueva…» → *Nota desde plantilla…* (o clic derecho en «+»). Vienen tres de fábrica (reunión, diario y lista de compras, en el idioma de la interfaz) y cualquier nota se puede guardar como plantilla desde el menú «…» → *Guardar como plantilla…*. Las propias viven en `templates/` dentro de la carpeta de notas, así que se sincronizan con ellas. Las bóvedas anteriores funcionan igual: la carpeta solo se crea al guardar la primera.

## [1.6.0] - 2026-10-20
### Agregado
- **Cambiar la contraseña** de una nota bloqueada (candado → «Cambiar contraseña…»). Se vuelve a cifrar con una sal nueva sin pasar por texto claro en disco. Se borra el historial de versiones de esa nota, porque estaba cifrado con la clave anterior (igual que al bloquear o quitar el bloqueo).
- La ventana recuerda su tamaño, posición y si estaba maximizada. Si la posición guardada queda fuera de las pantallas, se centra.

### Interno
- Prettier y ESLint con `npm run format`, `npm run format:check` y `npm run lint`; el CI los ejecuta. El reformateo inicial va en un commit aparte y no cambia la lógica.
- Guía de usuario con capturas en `docs/GUIA.md`.

## [1.5.0] - 2026-10-20
### Agregado
- **Interfaz en inglés** además del español. Libreta usa el idioma de tu sistema (español si es español, inglés en cualquier otro caso) y puedes cambiarlo en **Ajustes → Idioma**; al cambiarlo se vuelve a cargar la interfaz.
- Todos los textos viven ahora en `src/locales/es.json` y `src/locales/en.json`, y hay pruebas que comprueban que ambos idiomas tengan las mismas claves, las mismas variables y que el inglés no deje palabras en español. Agregar otro idioma es copiar un archivo (ver CONTRIBUTING).
- Los filtros de búsqueda ya existían en inglés (`tag:`, `folder:`, `has:`, `is:`, `before:`, `after:`) y ahora la guía y las sugerencias los muestran según el idioma.

### Cambiado
- La carpeta inicial, la nota de bienvenida, el menú, los diálogos del sistema y las exportaciones se escriben en el idioma elegido. Las notas y carpetas que ya tengas no se traducen.

## [1.4.1] - 2026-10-19
### Cambiado
- Versión de prueba del actualizador automático: no trae cambios de funciones. Sirve para comprobar que una instalación de la 1.4.0 detecta, descarga e instala una versión nueva.

## [1.4.0] - 2026-10-19
### Agregado
- **Ajustes** (`Ctrl+,`, Archivo → Ajustes… o el botón de la barra lateral): tema automático, claro u oscuro; seis colores de acento; letra, tamaño del texto y ancho de página de las notas; vista y orden de la lista; carpeta de notas y actualizaciones automáticas. Los cambios se ven al instante.
- GIF de demostración en el README.

## [1.3.0] - 2026-10-19
### Agregado
- **Actualización automática** desde las Releases de GitHub: tarjeta de aviso, descarga con progreso y reinicio para instalar, siempre con confirmación. Menú Ayuda → «Buscar actualizaciones…» y casilla para apagar la revisión automática.

### Cambiado
- Los instaladores usan nombres sin espacios para que coincidan con los archivos `latest.yml` de la Release.

## [1.2.0] - 2026-10-19
### Agregado
- **Guía rápida** dentro de la app (Ayuda → Guía rápida, `F1` o el botón de la barra lateral), con tarjetas por función, filtros de búsqueda para probar y atajos de teclado.
- Nota de bienvenida con lista de qué hacer y dónde está cada cosa.

## [1.1.2] - 2026-10-19
### Primera publicación
- Carpetas anidadas y carpetas inteligentes; listas de tareas, tablas, imágenes y archivos adjuntos; dibujo a mano y escáner con la cámara.
- Notas bloqueadas con contraseña (AES-256-GCM) e historial de versiones.
- Búsqueda sin acentos, tolerante a errores y con filtros; enlaces entre notas con `[[`.
- Importación desde Markdown, texto, HTML y Evernote; exportación a PDF, HTML y Markdown.
- Tema claro y oscuro según el sistema; icono propio.

[1.5.0]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.5.0
[1.4.1]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.4.1
[1.4.0]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.4.0
[1.3.0]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.3.0
[1.2.0]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.2.0
[1.1.2]: https://github.com/CorreaRicardo98/libreta/releases/tag/v1.1.2
