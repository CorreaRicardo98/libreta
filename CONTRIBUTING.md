# Cómo contribuir a Libreta

¡Gracias por querer ayudar! Libreta es de la comunidad: cualquier mejora, por pequeña que sea, suma. Aquí está lo necesario para empezar.

## Empezar

Necesitas [Node.js](https://nodejs.org) 22.12 o superior.

```bash
git clone https://github.com/CorreaRicardo98/libreta.git
cd libreta
npm install
npm run dev      # abre la app con recarga en vivo
npm test         # pruebas automáticas
```

Tus notas de desarrollo se guardan en `~/Documentos/Libreta` (o en la carpeta que elijas desde **Archivo → Cambiar carpeta de notas**). Usa una carpeta de prueba para no mezclar tus notas reales.

## Cómo está organizado

```
main/            Proceso principal de Electron (Node.js)
  main.js          ventana, menú, IPC, exportación a PDF/HTML/Markdown
  store.js         almacén de notas en archivos: carpetas, cifrado, historial, carpetas inteligentes
  importer.js      importadores: Markdown/HTML/texto y Evernote (.enex)
  preload.js       puente seguro entre la interfaz y el proceso principal (window.libreta)
src/             Interfaz (HTML + JavaScript sin framework, empaquetada con Vite)
  main.js          estado de la app, lista, barra lateral, acciones
  editor.js        editor TipTap, imágenes/adjuntos, sugerencias de «[[»
  search.js        motor de búsqueda (sin acentos, tolerante a errores, filtros)
  attachment.js    nodo de archivo adjunto
  notelink.js      nodo de enlace entre notas
  draw.js          dibujo a mano y escáner con cámara
  md.js            conversor HTML → Markdown
  ui.js            menús, diálogos, avisos, fechas
  styles.css       estilos y tema claro/oscuro
tests/           Pruebas con el ejecutor integrado de Node (node:test)
build/           Iconos de la app
```

### Cómo se guardan los datos

Todo vive en una carpeta («bóveda») que cualquiera puede sincronizar con Syncthing, Nextcloud, etc.:

```
notes/<id>.json     una nota: metadatos + HTML (o contenido cifrado si está bloqueada)
folders.json        carpetas (con parentId)
smart.json          carpetas inteligentes
history/<id>/*.json versiones anteriores de cada nota
attachments/*       imágenes y archivos adjuntos
```

**Importante:** el formato de estos archivos es una promesa a quien ya tiene notas. Si cambias algo, hazlo de forma compatible hacia atrás y añade una prueba en `tests/`.

## Flujo de trabajo

1. Busca un [issue](https://github.com/CorreaRicardo98/libreta/issues) (los marcados `good first issue` son buenos para empezar) o abre uno para comentar tu idea antes de programar algo grande.
2. Crea una rama: `git checkout -b mi-mejora`.
3. Haz el cambio, con su prueba si toca lógica (`store`, `search`, `importer`).
4. Corre `npm test` y prueba la app con `npm run dev`.
5. Abre un *pull request* usando la plantilla.

## Criterios del proyecto

- **Local primero.** Nada debe salir de la computadora de la persona sin que ella lo pida. Sin cuentas, sin telemetría.
- **Español claro.** Los textos de la interfaz hablan de lo que la persona hace, no de cómo está construido el programa. Errores que explican qué pasó y cómo arreglarlo.
- **Accesible.** Todo se puede usar con teclado, con foco visible, con movimiento reducido respetado y en ventanas angostas.
- **Seguro.** No relajes `contextIsolation`, `sandbox` ni la política CSP de `src/index.html`. Todo acceso a archivos pasa por `main/`.
- **Sin dependencias porque sí.** Cada paquete nuevo pesa en el instalador. Justifica el que agregues.
- Estilo: JavaScript moderno, 2 espacios, comentarios solo donde el *porqué* no es obvio. Respeta el estilo del código de alrededor.

## Ideas para empezar

Mira [ROADMAP.md](ROADMAP.md). También ayudan mucho: probar en distintas distribuciones de Linux, traducir la interfaz, mejorar la accesibilidad y reportar errores con pasos claros.

## Compilar instaladores

```bash
npm run dist:linux   # AppImage y .deb
npm run dist:win     # instalador y portable (mejor desde Windows)
```

Las versiones oficiales las compila GitHub Actions al subir una etiqueta `vX.Y.Z`.

Al participar aceptas el [Código de convivencia](CODE_OF_CONDUCT.md) y que tu aporte se publique bajo la licencia [MIT](LICENSE) del proyecto.
