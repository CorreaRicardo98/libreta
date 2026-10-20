const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net, session, nativeTheme, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const importer = require('./importer');
const { createUpdater } = require('./updater');
const prefsLib = require('./prefs');
const i18n = require('./i18n');
const windowState = require('./windowstate');

const DEV = !!process.env.LIBRETA_DEV;
let win = null;
let store = null;
let watcher = null;
let updater = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'libreta', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// ---- ajustes (ubicación de la carpeta de notas)
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
const autoUpdates = () => readSettings().autoUpdate !== false; // activado salvo que la persona lo apague

// ---- preferencias de apariencia (el tema se aplica con nativeTheme: también cambia menús y diálogos del sistema)
// lang es el idioma efectivo (el elegido o, en «automático», el del sistema); language es lo que eligió la persona
const getPrefs = () => {
  const p = prefsLib.withDefaults(readSettings().prefs);
  return { ...p, autoUpdate: autoUpdates(), lang: i18n.resolveLang(p.language, app.getLocale()) };
};
const T = (key, vars) => i18n.translator(getPrefs().lang)(key, vars);
const applyTheme = () => {
  nativeTheme.themeSource = getPrefs().theme;
};
function setPrefs(patch) {
  const settings = readSettings();
  const next = { ...settings, prefs: { ...(settings.prefs || {}), ...prefsLib.sanitize(patch) } };
  const autoChanged = typeof patch?.autoUpdate === 'boolean' && patch.autoUpdate !== autoUpdates();
  const langBefore = getPrefs().lang;
  if (typeof patch?.autoUpdate === 'boolean') next.autoUpdate = patch.autoUpdate;
  writeSettings(next);
  applyTheme();
  if (autoChanged || getPrefs().lang !== langBefore) buildMenu(); // la casilla de Ayuda y los textos del menú deben reflejar el cambio
  return getPrefs();
}
const defaultVault = () => path.join(app.getPath('documents'), 'Libreta');

function watchVault() {
  watcher?.close();
  let t;
  try {
    watcher = fs.watch(store.notesDir, () => {
      clearTimeout(t);
      t = setTimeout(() => win?.webContents.send('notes:external-change'), 400);
    });
  } catch {
    watcher = null;
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized() || win.isFullScreen();
  const b = win.getNormalBounds(); // tamaño normal aunque esté maximizada
  writeSettings({ ...readSettings(), window: { ...b, maximized } });
}

function createWindow() {
  const { maximized, ...frame } = windowState.restore(readSettings().window, screen.getAllDisplays());
  win = new BrowserWindow({
    ...frame,
    minWidth: windowState.MIN.width,
    minHeight: windowState.MIN.height,
    title: 'Libreta',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12161e' : '#f6f7f9',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (maximized) win.maximize();
  win.on('close', saveWindowState);
  // enlaces externos al navegador, nunca dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    }
  });
  if (DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
}

function buildMenu() {
  const send = (cmd) => () => win?.webContents.send('menu', cmd);
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' }] : []),
      {
        label: T('menu.file'),
        submenu: [
          { label: T('note.newDefault'), accelerator: 'CmdOrCtrl+N', click: send('new-note') },
          { label: T('folder.newTitle'), accelerator: 'CmdOrCtrl+Shift+N', click: send('new-folder') },
          { type: 'separator' },
          { label: T('folder.importMenu'), click: send('import') },
          { label: T('menu.exportPdf'), click: send('export-pdf') },
          { label: T('menu.exportHtml'), click: send('export-html') },
          { label: T('menu.exportMd'), click: send('export-md') },
          { type: 'separator' },
          { label: T('menu.settings'), accelerator: 'CmdOrCtrl+,', click: send('settings') },
          { label: T('menu.openVault'), click: () => shell.openPath(store.dir) },
          { label: T('menu.changeVault'), click: send('change-vault') },
          { type: 'separator' },
          mac ? { role: 'close' } : { role: 'quit', label: T('menu.quit') },
        ],
      },
      {
        label: T('menu.edit'),
        submenu: [
          { role: 'undo', label: T('menu.undo') },
          { role: 'redo', label: T('menu.redo') },
          { type: 'separator' },
          { role: 'cut', label: T('menu.cut') },
          { role: 'copy', label: T('menu.copy') },
          { role: 'paste', label: T('menu.paste') },
          { role: 'selectAll', label: T('menu.selectAll') },
          { type: 'separator' },
          { label: T('menu.search'), accelerator: 'CmdOrCtrl+F', click: send('focus-search') },
        ],
      },
      {
        label: T('menu.help'),
        submenu: [
          { label: T('side.help'), accelerator: 'F1', click: send('help') },
          { label: T('menu.shortcuts'), click: send('help-keys') },
          { type: 'separator' },
          { label: T('menu.checkUpdates'), click: () => updater?.check({ manual: true }) },
          { label: T('set.auto'), type: 'checkbox', checked: autoUpdates(), click: (item) => writeSettings({ ...readSettings(), autoUpdate: item.checked }) },
          { type: 'separator' },
          { label: T('menu.report'), click: () => shell.openExternal('https://github.com/CorreaRicardo98/libreta/issues/new/choose') },
          { label: T('help.code'), click: () => shell.openExternal('https://github.com/CorreaRicardo98/libreta') },
        ],
      },
      {
        label: T('menu.view'),
        submenu: [
          { label: T('list.asList'), accelerator: 'CmdOrCtrl+1', click: send('view-list') },
          { label: T('list.asGallery'), accelerator: 'CmdOrCtrl+2', click: send('view-gallery') },
          { type: 'separator' },
          { role: 'zoomIn', label: T('menu.zoomIn') },
          { role: 'zoomOut', label: T('menu.zoomOut') },
          { role: 'resetZoom', label: T('menu.resetZoom') },
          { type: 'separator' },
          { role: 'togglefullscreen', label: T('menu.fullscreen') },
          ...(DEV ? [{ role: 'toggleDevTools' }] : []),
        ],
      },
    ]),
  );
}

function registerIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, (_e, ...a) => fn(...a));

  h('folders:list', () => store.listFolders());
  h('folders:create', (n, parentId) => store.createFolder(n, parentId));
  h('folders:ensurePath', (segs) => store.ensureFolderPath(segs));
  h('folders:move', (id, parentId) => store.moveFolder(id, parentId));
  h('smart:list', () => store.listSmart());
  h('smart:save', (sf) => store.saveSmart(sf));
  h('smart:remove', (id) => store.removeSmart(id));
  h('folders:rename', (id, n) => store.renameFolder(id, n));
  h('folders:remove', (id) => store.deleteFolder(id));

  h('notes:list', () => store.list());
  h('notes:get', (id) => store.get(id));
  h('notes:create', (folderId) => store.create(folderId));
  h('notes:save', (note) => store.save(note));
  h('notes:setMeta', (id, patch) => store.setMeta(id, patch));
  h('notes:trash', (id) => store.trash(id));
  h('notes:restore', (id) => store.restore(id));
  h('notes:purge', (id) => store.purge(id));
  h('notes:createFull', (d) => store.createFull(d));
  h('history:list', (id) => store.listVersions(id));
  h('history:get', (id, t) => store.getVersion(id, t));
  h('history:restore', (id, t) => store.restoreVersion(id, t));
  h('notes:lock', (id, pwd) => store.lockNote(id, pwd));
  h('notes:unlock', (id, pwd) => store.unlockNote(id, pwd));
  h('notes:relock', (id) => store.relock(id));
  h('notes:changePassword', (id, oldPwd, newPwd) => store.changePassword(id, oldPwd, newPwd));
  h('notes:removeLock', (id, pwd) => store.removeLock(id, pwd));
  h('notes:emptyTrash', () => store.emptyTrash());

  h('attach:save', (name, bytes) => `libreta://att/${store.saveAttachment(name, bytes)}`);

  // kind: 'folder' (Markdown/HTML/texto con subcarpetas) | 'enex' (Evernote) | 'files' (archivos sueltos)
  h('import:run', async (kind) => {
    const filters = {
      enex: [{ name: 'Evernote', extensions: ['enex'] }],
      files: [{ name: T('dlg.notesFilter'), extensions: ['md', 'markdown', 'txt', 'html', 'htm'] }],
    };
    const r = await dialog.showOpenDialog(win, {
      title: { folder: T('dlg.importFolder'), enex: T('dlg.importEnex'), files: T('dlg.importFiles') }[kind],
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters: filters[kind],
    });
    if (r.canceled || !r.filePaths.length) return null;
    if (kind === 'folder') return importer.importFolder(store, r.filePaths[0]);
    if (kind === 'files') return importer.importLoose(store, r.filePaths, T('import.looseFolder'));
    const all = { items: [], skipped: [] };
    for (const f of r.filePaths) {
      const x = importer.importEnex(store, f);
      all.items.push(...x.items);
      all.skipped.push(...x.skipped);
    }
    return all;
  });

  h('attach:open', async (url) => {
    const m = /^libreta:\/\/att\/([\w.-]+)$/.exec(String(url));
    if (!m) return 'invalid link';
    return shell.openPath(store.attachmentPath(m[1]));
  });

  h('prefs:get', () => getPrefs());
  h('prefs:set', (patch) => setPrefs(patch));
  ipcMain.on('prefs:getSync', (e) => {
    e.returnValue = getPrefs();
  });
  h('update:check', () => updater?.check({ manual: true }));
  h('update:download', () => updater?.download());
  h('update:install', () => updater?.install());
  h('update:openReleases', () => updater?.openReleases());
  h('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
  h('vault:info', () => ({ dir: store.dir }));
  h('vault:open', () => shell.openPath(store.dir));
  h('vault:change', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: T('dlg.vault'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    store.setVault(r.filePaths[0]);
    writeSettings({ ...readSettings(), vault: store.dir });
    watchVault();
    return store.dir;
  });

  h('export:note', async (kind, title, html) => {
    const safe = (title || T('note.untitled')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const ext = kind === 'pdf' ? 'pdf' : kind === 'md' ? 'md' : 'html';
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), `${safe}.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return false;
    if (kind === 'md') return writeMarkdown(r.filePath, html);
    // las imágenes adjuntas se incrustan para que el archivo sea autónomo
    const inlined = html.replace(/libreta:\/\/att\/([\w.-]+)/g, (_m, f) => {
      try {
        const p = store.attachmentPath(f);
        const mime =
          { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(p).toLowerCase()] ||
          'application/octet-stream';
        return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
      } catch {
        return '';
      }
    });
    const doc = `<!doctype html><html lang="${getPrefs().lang}"><meta charset="utf-8"><title>${escapeHtml(safe)}</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b2430}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.35rem .6rem}
blockquote{border-left:3px solid #999;margin-left:0;padding-left:1rem;color:#555}
ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:.5rem}
pre,code{font-family:ui-monospace,Consolas,monospace;background:#f1f2f4}</style><body>${inlined}</body></html>`;
    if (kind === 'html') {
      fs.writeFileSync(r.filePath, doc);
      return true;
    }
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);
    const pdf = await pdfWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    pdfWin.destroy();
    fs.writeFileSync(r.filePath, pdf);
    return true;
  });
}

// Markdown: los adjuntos se copian junto al archivo, en una carpeta «<nombre>_adjuntos»
function writeMarkdown(file, md) {
  const names = [...new Set([...md.matchAll(/libreta:\/\/att\/([\w.-]+)/g)].map((m) => m[1]))];
  if (names.length) {
    const folder = `${path.basename(file, '.md')}${T('export.attachmentsSuffix')}`;
    const dest = path.join(path.dirname(file), folder);
    fs.mkdirSync(dest, { recursive: true });
    for (const n of names) {
      try {
        fs.copyFileSync(store.attachmentPath(n), path.join(dest, n));
      } catch {
        /* adjunto perdido */
      }
    }
    md = md.replace(/libreta:\/\/att\/([\w.-]+)/g, (_m, n) => `${encodeURIComponent(folder)}/${n}`);
  }
  fs.writeFileSync(file, md);
  return true;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    protocol.handle('libreta', (req) => {
      const u = new URL(req.url);
      if (u.hostname !== 'att') return new Response('not found', { status: 404 });
      const file = store.attachmentPath(decodeURIComponent(u.pathname.slice(1)));
      return net.fetch(pathToFileURL(file).toString());
    });
    // la cámara solo se usa para el escáner de documentos de la propia app
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');
    applyTheme();
    store = new Store(readSettings().vault || defaultVault(), { defaultFolderName: T('folder.defaultName') });
    registerIpc();
    buildMenu();
    createWindow();
    watchVault();
    updater = createUpdater({ send: (p) => win?.webContents.send('update', p), getAuto: autoUpdates });
    updater.start();
  });
  app.on('window-all-closed', () => app.quit());
}
