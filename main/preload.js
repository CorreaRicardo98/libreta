const { contextBridge, ipcRenderer } = require('electron');

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('libreta', {
  platform: process.platform,
  folders: {
    list: () => call('folders:list'),
    create: (name, parentId) => call('folders:create', name, parentId),
    move: (id, parentId) => call('folders:move', id, parentId),
    ensurePath: (segs) => call('folders:ensurePath', segs),
    rename: (id, name) => call('folders:rename', id, name),
    remove: (id) => call('folders:remove', id),
  },
  notes: {
    list: () => call('notes:list'),
    get: (id) => call('notes:get', id),
    create: (folderId) => call('notes:create', folderId),
    save: (note) => call('notes:save', note),
    setMeta: (id, patch) => call('notes:setMeta', id, patch),
    trash: (id) => call('notes:trash', id),
    restore: (id) => call('notes:restore', id),
    purge: (id) => call('notes:purge', id),
    createFull: (d) => call('notes:createFull', d),
    lock: (id, pwd) => call('notes:lock', id, pwd),
    unlock: (id, pwd) => call('notes:unlock', id, pwd),
    relock: (id) => call('notes:relock', id),
    removeLock: (id, pwd) => call('notes:removeLock', id, pwd),
    emptyTrash: () => call('notes:emptyTrash'),
  },
  history: {
    list: (id) => call('history:list', id),
    get: (id, t) => call('history:get', id, t),
    restore: (id, t) => call('history:restore', id, t),
  },
  updates: {
    check: () => call('update:check'),
    download: () => call('update:download'),
    install: () => call('update:install'),
    openReleases: () => call('update:openReleases'),
  },
  appInfo: () => call('app:info'),
  importNotes: (kind) => call('import:run', kind),
  smart: {
    list: () => call('smart:list'),
    save: (sf) => call('smart:save', sf),
    remove: (id) => call('smart:remove', id),
  },
  attach: (name, bytes) => call('attach:save', name, bytes),
  openAttachment: (url) => call('attach:open', url),
  exportNote: (kind, title, html) => call('export:note', kind, title, html),
  vault: {
    info: () => call('vault:info'),
    open: () => call('vault:open'),
    change: () => call('vault:change'),
  },
  on: (channel, fn) => {
    const allowed = ['menu', 'notes:external-change', 'update'];
    if (!allowed.includes(channel)) return () => {};
    const h = (_e, ...a) => fn(...a);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
