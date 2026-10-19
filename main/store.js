// Almacén de notas en archivos: una carpeta ("vault") que se puede sincronizar
// con Syncthing, Nextcloud, Dropbox, etc.
//   vault/notes/<id>.json    nota (metadatos + HTML, o contenido cifrado si está bloqueada)
//   vault/folders.json       carpetas (con parentId para anidarlas)
//   vault/smart.json         carpetas inteligentes (reglas guardadas)
//   vault/attachments/*      imágenes y archivos adjuntos
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TRASH_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HIST_GAP = 5 * 60 * 1000; // como mucho una versión guardada cada 5 minutos
const HIST_MAX = 60;
const SECRET_FIELDS = ['title', 'preview', 'thumb', 'html', 'text', 'tags'];

class Store {
  constructor(vaultDir) {
    this.keys = new Map(); // id de nota -> clave derivada (solo mientras está abierta)
    this.setVault(vaultDir);
  }

  setVault(dir) {
    this.dir = dir;
    this.keys.clear();
    this.notesDir = path.join(dir, 'notes');
    this.attDir = path.join(dir, 'attachments');
    this.foldersFile = path.join(dir, 'folders.json');
    this.smartFile = path.join(dir, 'smart.json');
    this.histDir = path.join(dir, 'history');
    fs.mkdirSync(this.notesDir, { recursive: true });
    fs.mkdirSync(this.attDir, { recursive: true });
    if (!fs.existsSync(this.foldersFile)) {
      this._writeAtomic(this.foldersFile, JSON.stringify([
        { id: newId(), name: 'Notas', parentId: null, created: Date.now() },
      ], null, 2));
    }
    this.purgeTrash();
  }

  _writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  _notePath(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('id inválido');
    return path.join(this.notesDir, `${id}.json`);
  }

  // ---- carpetas
  listFolders() {
    try {
      return JSON.parse(fs.readFileSync(this.foldersFile, 'utf8')).map((f) => ({ parentId: null, ...f }));
    } catch { return []; }
  }
  _saveFolders(list) { this._writeAtomic(this.foldersFile, JSON.stringify(list, null, 2)); }
  _descendants(list, id) {
    const out = [];
    const walk = (p) => { for (const f of list) if (f.parentId === p) { out.push(f.id); walk(f.id); } };
    walk(id);
    return out;
  }
  createFolder(name, parentId = null) {
    const list = this.listFolders();
    const f = {
      id: newId(), name: String(name || 'Carpeta nueva').slice(0, 80),
      parentId: list.some((x) => x.id === parentId) ? parentId : null, created: Date.now(),
    };
    list.push(f);
    this._saveFolders(list);
    return f;
  }
  renameFolder(id, name) {
    const list = this.listFolders();
    const f = list.find((x) => x.id === id);
    if (f) f.name = String(name).slice(0, 80);
    this._saveFolders(list);
    return list;
  }
  moveFolder(id, parentId) {
    const list = this.listFolders();
    const f = list.find((x) => x.id === id);
    const bad = id === parentId || this._descendants(list, id).includes(parentId);
    if (f && !bad) f.parentId = list.some((x) => x.id === parentId) ? parentId : null;
    this._saveFolders(list);
    return list;
  }
  deleteFolder(id) {
    const list = this.listFolders();
    const gone = new Set([id, ...this._descendants(list, id)]);
    const rest = list.filter((x) => !gone.has(x.id));
    if (!rest.length) return list; // siempre queda una carpeta
    this._saveFolders(rest);
    const fallback = rest[0].id;
    for (const n of this._readAll()) {
      if (!gone.has(n.folderId)) continue;
      // las notas van a la papelera; si se recuperan, caerán en la primera carpeta
      if (!n.deletedAt) n.deletedAt = Date.now();
      n.folderId = fallback;
      this._write(n);
    }
    return rest;
  }

  // ---- carpetas inteligentes
  listSmart() {
    try { return JSON.parse(fs.readFileSync(this.smartFile, 'utf8')); } catch { return []; }
  }
  saveSmart(sf) {
    const list = this.listSmart();
    const r = sf.rules || {};
    const clean = {
      id: sf.id || newId(), name: String(sf.name || 'Carpeta inteligente').slice(0, 80),
      rules: {
        tags: (r.tags || []).map(String).slice(0, 20),
        text: String(r.text || '').slice(0, 100),
        query: String(r.query || '').slice(0, 200),
        folderId: r.folderId || '',
        tasks: !!r.tasks, images: !!r.images, files: !!r.files, tables: !!r.tables, pinned: !!r.pinned,
      },
    };
    const i = list.findIndex((x) => x.id === clean.id);
    if (i >= 0) list[i] = clean; else list.push(clean);
    this._writeAtomic(this.smartFile, JSON.stringify(list, null, 2));
    return list;
  }
  removeSmart(id) {
    const list = this.listSmart().filter((x) => x.id !== id);
    this._writeAtomic(this.smartFile, JSON.stringify(list, null, 2));
    return list;
  }

  // ---- notas
  _readAll() {
    const out = [];
    for (const f of fs.readdirSync(this.notesDir)) {
      if (!f.endsWith('.json')) continue;
      try { out.push(JSON.parse(fs.readFileSync(path.join(this.notesDir, f), 'utf8'))); }
      catch { /* archivo a medio sincronizar: se ignora */ }
    }
    return out;
  }
  _write(n) { this._writeAtomic(this._notePath(n.id), JSON.stringify(n)); }
  _raw(id) {
    try { return JSON.parse(fs.readFileSync(this._notePath(id), 'utf8')); } catch { return null; }
  }
  _meta(n) {
    const { html, lock, ...meta } = n;
    return { ...meta, flags: flagsOf(html || ''), links: linksOf(html || '') };
  }

  list() { return this._readAll().map((n) => this._meta(n)); }

  /** Nota lista para el editor. Si está bloqueada y sin clave, devuelve solo metadatos (html: null). */
  get(id) {
    const n = this._raw(id);
    if (!n || !n.locked) return n;
    const key = this.keys.get(id);
    if (!key) return { ...this._meta(n), html: null };
    try {
      const { lock, ...rest } = n;
      return { ...rest, ...decrypt(key, lock) };
    } catch { this.keys.delete(id); return { ...this._meta(n), html: null }; }
  }

  create(folderId) {
    const folders = this.listFolders();
    const now = Date.now();
    const n = {
      id: newId(), title: '', preview: '', thumb: '', html: '', text: '', tags: [],
      folderId: folders.some((f) => f.id === folderId) ? folderId : folders[0].id,
      pinned: false, created: now, updated: now, deletedAt: null,
    };
    this._write(n);
    return n;
  }

  save(patch) {
    const cur = this._raw(patch.id);
    if (!cur) return null;
    const body = pick(patch, SECRET_FIELDS);
    this._snapshot(cur);
    let n;
    if (cur.locked) {
      const key = this.keys.get(cur.id);
      if (!key) return null; // sin contraseña no se escribe nada
      const merged = { ...decrypt(key, cur.lock), ...body };
      n = { ...cur, lock: encrypt(key, pick(merged, SECRET_FIELDS), cur.lock.salt), updated: Date.now() };
    } else {
      n = { ...cur, ...body, updated: Date.now() };
    }
    this._write(n);
    return this._meta(n);
  }

  setMeta(id, patch) {
    const cur = this._raw(id);
    if (!cur) return null;
    const n = { ...cur, ...pick(patch, ['folderId', 'pinned']) };
    this._write(n);
    return this._meta(n);
  }

  // ---- bloqueo con contraseña (AES-256-GCM, clave derivada con scrypt)
  lockNote(id, password) {
    const cur = this._raw(id);
    if (!cur || cur.locked || !password) return null;
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32, SCRYPT);
    const n = {
      ...cur, locked: true,
      title: '', preview: '', thumb: '', html: '', text: '', tags: [],
      lock: encrypt(key, pick(cur, SECRET_FIELDS), salt.toString('base64')),
    };
    this._write(n);
    this.keys.delete(id);
    this._clearHistory(id); // las versiones en claro no pueden quedarse junto a una nota cifrada
    return this._meta(n);
  }
  unlockNote(id, password) {
    const cur = this._raw(id);
    if (!cur?.locked) return this.get(id);
    try {
      const key = crypto.scryptSync(String(password), Buffer.from(cur.lock.salt, 'base64'), 32, SCRYPT);
      decrypt(key, cur.lock); // lanza si la contraseña es incorrecta
      this.keys.set(id, key);
      return this.get(id);
    } catch { return null; }
  }
  relock(id) { this.keys.delete(id); }
  removeLock(id, password) {
    const cur = this._raw(id);
    if (!cur?.locked) return cur ? this._meta(cur) : null;
    if (!this.unlockNote(id, password)) return null;
    const { lock, locked, ...rest } = cur;
    const n = { ...rest, ...decrypt(this.keys.get(id), lock) };
    this._write(n);
    this.keys.delete(id);
    this._clearHistory(id);
    return this._meta(n);
  }

  // ---- historial de versiones
  _histPath(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('id inválido');
    return path.join(this.histDir, id);
  }
  _histTimes(id) {
    try {
      return fs.readdirSync(this._histPath(id)).filter((f) => /^\d+\.json$/.test(f)).map((f) => Number(f.slice(0, -5))).sort((a, b) => b - a);
    } catch { return []; }
  }
  _snapshot(cur, force = false) {
    if (!cur || (!cur.locked && !cur.html)) return;
    const times = this._histTimes(cur.id);
    const now = Date.now();
    if (!force && times[0] && now - times[0] < HIST_GAP) return;
    const dir = this._histPath(cur.id);
    const data = cur.locked
      ? { t: now, locked: true, lock: cur.lock }
      : { t: now, ...pick(cur, SECRET_FIELDS) };
    if (times[0]) {
      try {
        const last = JSON.parse(fs.readFileSync(path.join(dir, `${times[0]}.json`), 'utf8'));
        if (!cur.locked && last.html === data.html) return; // sin cambios desde la última versión
        if (cur.locked && last.lock?.data === data.lock.data) return;
      } catch { /* versión ilegible: se guarda otra */ }
    }
    fs.mkdirSync(dir, { recursive: true });
    this._writeAtomic(path.join(dir, `${now}.json`), JSON.stringify(data));
    for (const t of times.slice(HIST_MAX - 1)) { try { fs.unlinkSync(path.join(dir, `${t}.json`)); } catch { /* ya no está */ } }
  }
  _clearHistory(id) { try { fs.rmSync(this._histPath(id), { recursive: true, force: true }); } catch { /* sin historial */ } }
  _readVersion(id, t) {
    if (!/^\d+$/.test(String(t))) return null;
    let v;
    try { v = JSON.parse(fs.readFileSync(path.join(this._histPath(id), `${t}.json`), 'utf8')); } catch { return null; }
    if (!v.locked) return v;
    const key = this.keys.get(id);
    if (!key) return null;
    try { return { t: v.t, ...decrypt(key, v.lock) }; } catch { return null; }
  }
  listVersions(id) {
    return this._histTimes(id).map((t) => {
      const v = this._readVersion(id, t);
      return v ? { t, title: v.title || '', preview: v.preview || '', chars: (v.text || '').length } : null;
    }).filter(Boolean);
  }
  getVersion(id, t) {
    const v = this._readVersion(id, t);
    return v ? { t: v.t, title: v.title || '', html: v.html || '' } : null;
  }
  restoreVersion(id, t) {
    const cur = this._raw(id);
    const v = this._readVersion(id, t);
    if (!cur || !v) return null;
    this._snapshot(cur, true); // lo que había antes de restaurar también se conserva
    const body = pick(v, SECRET_FIELDS);
    let n;
    if (cur.locked) {
      const key = this.keys.get(id);
      if (!key) return null;
      n = { ...cur, lock: encrypt(key, body, cur.lock.salt), updated: Date.now() };
    } else n = { ...cur, ...body, updated: Date.now() };
    this._write(n);
    return this.get(id);
  }

  // ---- importación
  ensureFolderPath(segments) {
    const list = this.listFolders();
    let parent = null;
    for (const raw of segments) {
      const name = String(raw || 'Sin nombre').slice(0, 80);
      let f = list.find((x) => (x.parentId || null) === parent && x.name === name);
      if (!f) { f = { id: newId(), name, parentId: parent, created: Date.now() }; list.push(f); }
      parent = f.id;
    }
    this._saveFolders(list);
    return parent || list[0].id;
  }
  createFull(d) {
    const folders = this.listFolders();
    const now = Date.now();
    const n = {
      id: /^[a-z0-9-]+$/i.test(d.id || '') ? d.id : newId(),
      ...Object.fromEntries(SECRET_FIELDS.map((k) => [k, k === 'tags' ? [] : ''])),
      ...pick(d, SECRET_FIELDS),
      folderId: folders.some((f) => f.id === d.folderId) ? d.folderId : folders[0].id,
      pinned: false, created: d.created || now, updated: d.updated || now, deletedAt: null,
    };
    this._write(n);
    return this._meta(n);
  }

  trash(id) {
    const n = this._raw(id);
    if (!n) return;
    n.deletedAt = Date.now();
    this._write(n);
  }
  restore(id) {
    const n = this._raw(id);
    if (!n) return;
    n.deletedAt = null;
    if (!this.listFolders().some((f) => f.id === n.folderId)) n.folderId = this.listFolders()[0].id;
    this._write(n);
  }
  purge(id) { this.keys.delete(id); this._clearHistory(id); try { fs.unlinkSync(this._notePath(id)); } catch { /* ya no existe */ } }
  emptyTrash() { for (const n of this._readAll()) if (n.deletedAt) this.purge(n.id); }
  purgeTrash() {
    const limit = Date.now() - TRASH_DAYS * 864e5;
    for (const n of this._readAll()) if (n.deletedAt && n.deletedAt < limit) this.purge(n.id);
  }

  // ---- adjuntos
  saveAttachment(name, bytes) {
    const ext = path.extname(String(name)).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8) || '.bin';
    const file = `${newId()}${ext}`;
    fs.writeFileSync(path.join(this.attDir, file), Buffer.from(bytes));
    return file;
  }
  attachmentPath(file) { return path.join(this.attDir, path.basename(file)); }
}

function flagsOf(html) {
  return {
    tasks: html.includes('data-type="taskList"'),
    images: /<img\b/.test(html),
    files: html.includes('data-type="attachment"'),
    tables: /<table\b/.test(html),
  };
}

function linksOf(html) {
  return [...new Set([...html.matchAll(/data-note-link="([a-z0-9-]+)"/gi)].map((m) => m[1]))];
}

function encrypt(key, obj, salt) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { salt, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decrypt(key, lock) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(lock.iv, 'base64'));
  d.setAuthTag(Buffer.from(lock.tag, 'base64'));
  const out = Buffer.concat([d.update(Buffer.from(lock.data, 'base64')), d.final()]);
  return JSON.parse(out.toString('utf8'));
}

function newId() { return crypto.randomUUID(); }
function pick(o, keys) { const r = {}; for (const k of keys) if (k in o) r[k] = o[k]; return r; }

module.exports = { Store, TRASH_DAYS };
