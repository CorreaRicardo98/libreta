const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const importer = require('./importer');
const { createUpdater } = require('./updater');

const DEV = !!process.env.LIBRETA_DEV;
let win = null;
let store = null;
let watcher = null;
let updater = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'libreta', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ---- ajustes (ubicación de la carpeta de notas)
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
const autoUpdates = () => readSettings().autoUpdate !== false; // activado salvo que la persona lo apague
const defaultVault = () => path.join(app.getPath('documents'), 'Libreta');

function watchVault() {
  watcher?.close();
  let t;
  try {
    watcher = fs.watch(store.notesDir, () => {
      clearTimeout(t);
      t = setTimeout(() => win?.webContents.send('notes:external-change'), 400);
    });
  } catch { watcher = null; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 720, minHeight: 480,
    title: 'Libreta',
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nota nueva', accelerator: 'CmdOrCtrl+N', click: send('new-note') },
        { label: 'Carpeta nueva', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-folder') },
        { type: 'separator' },
        { label: 'Importar notas…', click: send('import') },
        { label: 'Exportar como PDF…', click: send('export-pdf') },
        { label: 'Exportar como HTML…', click: send('export-html') },
        { label: 'Exportar como Markdown…', click: send('export-md') },
        { type: 'separator' },
        { label: 'Abrir carpeta de notas', click: () => shell.openPath(store.dir) },
        { label: 'Cambiar carpeta de notas…', click: send('change-vault') },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        { label: 'Buscar notas', accelerator: 'CmdOrCtrl+F', click: send('focus-search') },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Guía rápida', accelerator: 'F1', click: send('help') },
        { label: 'Atajos de teclado', click: send('help-keys') },
        { type: 'separator' },
        { label: 'Buscar actualizaciones…', click: () => updater?.check({ manual: true }) },
        { label: 'Buscar actualizaciones automáticamente', type: 'checkbox', checked: autoUpdates(), click: (item) => writeSettings({ ...readSettings(), autoUpdate: item.checked }) },
        { type: 'separator' },
        { label: 'Reportar un error…', click: () => shell.openExternal('https://github.com/CorreaRicardo98/libreta/issues/new/choose') },
        { label: 'Código y comunidad', click: () => shell.openExternal('https://github.com/CorreaRicardo98/libreta') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Como lista', accelerator: 'CmdOrCtrl+1', click: send('view-list') },
        { label: 'Como galería', accelerator: 'CmdOrCtrl+2', click: send('view-gallery') },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(DEV ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
  ]));
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
  h('notes:removeLock', (id, pwd) => store.removeLock(id, pwd));
  h('notes:emptyTrash', () => store.emptyTrash());

  h('attach:save', (name, bytes) => `libreta://att/${store.saveAttachment(name, bytes)}`);

  // kind: 'folder' (Markdown/HTML/texto con subcarpetas) | 'enex' (Evernote) | 'files' (archivos sueltos)
  h('import:run', async (kind) => {
    const filters = {
      enex: [{ name: 'Evernote', extensions: ['enex'] }],
      files: [{ name: 'Notas', extensions: ['md', 'markdown', 'txt', 'html', 'htm'] }],
    };
    const r = await dialog.showOpenDialog(win, {
      title: { folder: 'Elige la carpeta con tus notas', enex: 'Elige los archivos de Evernote', files: 'Elige los archivos de notas' }[kind],
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters: filters[kind],
    });
    if (r.canceled || !r.filePaths.length) return null;
    if (kind === 'folder') return importer.importFolder(store, r.filePaths[0]);
    if (kind === 'files') return importer.importLoose(store, r.filePaths);
    const all = { items: [], skipped: [] };
    for (const f of r.filePaths) {
      const x = importer.importEnex(store, f);
      all.items.push(...x.items); all.skipped.push(...x.skipped);
    }
    return all;
  });

  h('attach:open', async (url) => {
    const m = /^libreta:\/\/att\/([\w.-]+)$/.exec(String(url));
    if (!m) return 'enlace no válido';
    return shell.openPath(store.attachmentPath(m[1]));
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
      title: 'Elige la carpeta donde guardar tus notas',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    store.setVault(r.filePaths[0]);
    writeSettings({ ...readSettings(), vault: store.dir });
    watchVault();
    return store.dir;
  });

  h('export:note', async (kind, title, html) => {
    const safe = (title || 'Nota sin título').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
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
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(p).toLowerCase()] || 'application/octet-stream';
        return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
      } catch { return ''; }
    });
    const doc = `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapeHtml(safe)}</title>
<style>body{font:16px/1.6 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b2430}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.35rem .6rem}
blockquote{border-left:3px solid #999;margin-left:0;padding-left:1rem;color:#555}
ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:.5rem}
pre,code{font-family:ui-monospace,Consolas,monospace;background:#f1f2f4}</style><body>${inlined}</body></html>`;
    if (kind === 'html') { fs.writeFileSync(r.filePath, doc); return true; }
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
    const folder = `${path.basename(file, '.md')}_adjuntos`;
    const dest = path.join(path.dirname(file), folder);
    fs.mkdirSync(dest, { recursive: true });
    for (const n of names) {
      try { fs.copyFileSync(store.attachmentPath(n), path.join(dest, n)); } catch { /* adjunto perdido */ }
    }
    md = md.replace(/libreta:\/\/att\/([\w.-]+)/g, (_m, n) => `${encodeURIComponent(folder)}/${n}`);
  }
  fs.writeFileSync(file, md);
  return true;
}

function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('libreta', (req) => {
      const u = new URL(req.url);
      if (u.hostname !== 'att') return new Response('no encontrado', { status: 404 });
      const file = store.attachmentPath(decodeURIComponent(u.pathname.slice(1)));
      return net.fetch(pathToFileURL(file).toString());
    });
    // la cámara solo se usa para el escáner de documentos de la propia app
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');
    store = new Store(readSettings().vault || defaultVault());
    registerIpc();
    buildMenu();
    createWindow();
    watchVault();
    updater = createUpdater({ send: (p) => win?.webContents.send('update', p), getAuto: autoUpdates });
    updater.start();
  });
  app.on('window-all-closed', () => app.quit());
}
