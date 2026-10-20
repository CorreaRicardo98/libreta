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
npm run lint     # revisa errores con ESLint
npm run format   # da formato con Prettier (format:check solo comprueba)
```

Tus notas de desarrollo se guardan en `~/Documentos/Libreta` (o en la carpeta que elijas desde **Archivo → Cambiar carpeta de notas**). Usa una carpeta de prueba para no mezclar tus notas reales.

## Cómo está organizado

```
main/            Proceso principal de Electron (Node.js)
  main.js          ventana, menú, IPC, exportación a PDF/HTML/Markdown
  store.js         almacén de notas en archivos: carpetas, cifrado, historial, carpetas inteligentes
  prefs.js         preferencias de apariencia: valores permitidos y por defecto
  i18n.js          textos del proceso principal (menú, diálogos del sistema); lee los mismos archivos de idioma
  updater.js       actualización desde las Releases de GitHub (electron-updater)
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
  i18n.js          idiomas: t('clave'), plurales con tn() y traducción del HTML estático
  locales/         textos de la interfaz: es.json y en.json (claves planas)
  settings.js      ventana de Ajustes y aplicación de las preferencias
  help.js          guía rápida (Ayuda → Guía rápida): tarjetas, filtros y atajos
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
templates/<id>.json plantillas de nota propias (se crea al guardar la primera)
history/<id>/*.json versiones anteriores de cada nota
attachments/*       imágenes y archivos adjuntos
```

**Importante:** el formato de estos archivos es una promesa a quien ya tiene notas. Si cambias algo, hazlo de forma compatible hacia atrás y añade una prueba en `tests/`.

## Idiomas

Todos los textos de la interfaz están en `src/locales/<idioma>.json`, con claves planas (`"side.allNotes": "All notes"`). En el código se usa `t('clave')`, `t('clave', { variable })` para los `{variables}` y `tn('clave', n)` para plurales (`clave.one` / `clave.other`). En el HTML estático se usan los atributos `data-i18n`, `data-i18n-title`, `data-i18n-label` y `data-i18n-ph`.

**Para agregar un idioma:**
1. Copia `src/locales/en.json` a `src/locales/<codigo>.json` y traduce los valores (no las claves ni las `{variables}`).
2. Regístralo en `src/i18n.js`, en `main/i18n.js`, en `main/prefs.js` (`LANGUAGES`) y en `src/settings.js` (selector de Ajustes).
3. Corre `npm test`: comprueba que no falte ninguna clave y que las variables coincidan.

No escribas textos visibles directamente en el código: la prueba `tests/i18n.test.js` falla si usas una clave que no existe.

## Flujo de trabajo

1. Busca un [issue](https://github.com/CorreaRicardo98/libreta/issues) (los marcados `good first issue` son buenos para empezar) o abre uno para comentar tu idea antes de programar algo grande.
2. Crea una rama: `git checkout -b mi-mejora`.
3. Haz el cambio, con su prueba si toca lógica (`store`, `search`, `importer`).
4. Corre `npm run format`, `npm run lint` y `npm test`, y prueba la app con `npm run dev`. El CI ejecuta lint, comprobación de formato y pruebas.
5. Abre un *pull request* usando la plantilla.

## Criterios del proyecto

- **Local primero.** Nada debe salir de la computadora de la persona sin que ella lo pida. Sin cuentas, sin telemetría.
- **Español claro.** Los textos de la interfaz hablan de lo que la persona hace, no de cómo está construido el programa. Errores que explican qué pasó y cómo arreglarlo.
- **Accesible.** Todo se puede usar con teclado, con foco visible, con movimiento reducido respetado y en ventanas angostas.
- **Seguro.** No relajes `contextIsolation`, `sandbox` ni la política CSP de `src/index.html`. Todo acceso a archivos pasa por `main/`.
- **Sin dependencias porque sí.** Cada paquete nuevo pesa en el instalador. Justifica el que agregues.
- Estilo: Prettier (2 espacios, comillas simples, punto y coma; ver `.prettierrc.json`) y ESLint (`eslint.config.js`). `main/` es CommonJS y `src/` es ESM. Comentarios solo donde el *porqué* no es obvio. Respeta el estilo del código de alrededor.

## Ideas para empezar

Mira [ROADMAP.md](ROADMAP.md). También ayudan mucho: probar en distintas distribuciones de Linux, traducir la interfaz, mejorar la accesibilidad y reportar errores con pasos claros.

## Compilar instaladores

```bash
npm run dist:linux   # AppImage y .deb
npm run dist:win     # instalador y portable (mejor desde Windows)
```

Antes de publicar una versión, agrega su entrada en [CHANGELOG.md](CHANGELOG.md). Las versiones oficiales las compila GitHub Actions al subir una etiqueta `vX.Y.Z`. Esa Release también adjunta `latest.yml` y `latest-linux.yml`, que son los que lee la actualización automática: **no los borres ni renombres los instaladores**, y mantén los nombres sin espacios (`artifactName` en `package.json`).

Al participar aceptas el [Código de convivencia](CODE_OF_CONDUCT.md) y que tu aporte se publique bajo la licencia [MIT](LICENSE) del proyecto.
