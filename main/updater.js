// Actualización desde las Releases de GitHub.
//  - Instalador de Windows y AppImage: se descarga e instala dentro de la app (electron-updater).
//  - .deb: electron-updater lo intenta con el gestor de paquetes; si falla, se ofrece la página de descargas.
//  - Portable de Windows: no se puede reemplazar a sí misma; solo avisa y abre la página de descargas.
// Nada se descarga sin que la persona lo pida. La única consulta a internet es la lista de versiones de GitHub.
const { app, shell } = require('electron');
const { isNewer } = require('./version');

const REPO = 'CorreaRicardo98/libreta';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

/**
 * send(payload): manda el estado a la interfaz.
 * getAuto(): ¿buscar automáticamente?
 * Estados: available | none | downloading | ready | error | dev
 */
function createUpdater({ send, getAuto }) {
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  let au = null;
  let manual = false;      // la búsqueda la pidió la persona
  let downloading = false; // la descarga la pidió la persona
  let timer = null;

  function init() {
    if (au || !app.isPackaged || portable) return;
    au = require('electron-updater').autoUpdater;
    au.autoDownload = false;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    au.logger = null;
    au.on('update-available', (i) => { send({ state: 'available', version: i.version, manual, canInstall: true }); manual = false; });
    au.on('update-not-available', () => { if (manual) send({ state: 'none', current: app.getVersion() }); manual = false; });
    au.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (i) => { downloading = false; send({ state: 'ready', version: i.version }); });
    au.on('error', (e) => {
      // las búsquedas automáticas fallan en silencio (sin internet, por ejemplo)
      if (manual || downloading) send({ state: 'error', message: String(e?.message || e).slice(0, 240) });
      manual = false; downloading = false;
    });
  }

  // Portable: sin electron-updater, se consulta la API pública de GitHub.
  async function checkPortable(isManual) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
      const rel = await r.json();
      if (isNewer(rel.tag_name, app.getVersion())) send({ state: 'available', version: String(rel.tag_name).replace(/^v/, ''), manual: isManual, canInstall: false });
      else if (isManual) send({ state: 'none', current: app.getVersion() });
    } catch (e) {
      if (isManual) send({ state: 'error', message: String(e.message || e).slice(0, 240) });
    }
  }

  async function check({ manual: m = false } = {}) {
    if (!app.isPackaged) { if (m) send({ state: 'dev' }); return; }
    manual = m;
    if (portable) return checkPortable(m);
    init();
    try { await au.checkForUpdates(); } catch { /* el evento 'error' ya lo informó si hacía falta */ }
  }

  async function download() {
    if (!au) return;
    downloading = true;
    send({ state: 'downloading', percent: 0 });
    try { await au.downloadUpdate(); } catch { /* el evento 'error' lo informa */ }
  }

  // silent: instala sin asistente y vuelve a abrir la app
  function install() { au?.quitAndInstall(true, true); }

  function start() {
    clearInterval(timer);
    if (!app.isPackaged) return;
    setTimeout(() => { if (getAuto()) check(); }, 8000);
    timer = setInterval(() => { if (getAuto()) check(); }, CHECK_EVERY);
    timer.unref?.();
  }

  return { check, download, install, start, openReleases: () => shell.openExternal(RELEASES_URL) };
}

module.exports = { createUpdater, RELEASES_URL };
