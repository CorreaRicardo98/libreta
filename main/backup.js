// Copias de seguridad de la bóveda en un .tar.gz con fecha. Sin dependencias: el formato tar (ustar) es simple
// y gzip viene con Node. Cualquier herramienta lo abre (`tar -xzf copia.tar.gz`, 7-Zip, el administrador de archivos).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const BLOCK = 512;
const NAME_RE = /^libreta-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/;
const KEEP_CHOICES = [3, 7, 14, 30];
const EVERY_MS = { daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 };
const SLACK_MS = 5 * 60e3; // el reloj de la comprobación no es exacto

const DEFAULTS = { enabled: false, dir: '', every: 'daily', keep: 7, last: 0, lastError: '' };

/** Limpia lo guardado en settings.json: nunca confía en que tenga la forma esperada. */
function sanitizeConfig(c) {
  const o = c && typeof c === 'object' ? c : {};
  return {
    enabled: o.enabled === true,
    dir: typeof o.dir === 'string' && path.isAbsolute(o.dir) && o.dir.length <= 1000 ? o.dir : '',
    every: o.every === 'weekly' ? 'weekly' : 'daily',
    keep: KEEP_CHOICES.includes(o.keep) ? o.keep : DEFAULTS.keep,
    last: Number.isFinite(o.last) && o.last > 0 ? o.last : 0,
    lastError: typeof o.lastError === 'string' ? o.lastError.slice(0, 300) : '',
  };
}

function isDue(cfg, now = Date.now()) {
  return cfg.enabled && !!cfg.dir && now - cfg.last >= EVERY_MS[cfg.every] - SLACK_MS;
}

const pad2 = (n) => String(n).padStart(2, '0');
function backupName(d = new Date()) {
  return `libreta-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.tar.gz`;
}

// ---- tar (ustar)
const octal = (n, len) => `${n.toString(8).padStart(len - 1, '0')}\0`;

function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  // ustar guarda hasta 255 bytes partiendo la ruta en «prefijo» (155) y «nombre» (100) por una barra
  for (let i = name.indexOf('/'); i !== -1; i = name.indexOf('/', i + 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100 && rest) return { name: rest, prefix };
  }
  throw new Error(`Ruta demasiado larga para la copia: ${name.slice(0, 80)}…`);
}

function header(relPath, { size = 0, mtime = 0, dir = false }) {
  const { name, prefix } = splitName(dir ? `${relPath}/` : relPath);
  const h = Buffer.alloc(BLOCK);
  h.write(name, 0, 100, 'utf8');
  h.write(octal(dir ? 0o755 : 0o644, 8), 100, 8, 'ascii');
  h.write(octal(0, 8), 108, 8, 'ascii');
  h.write(octal(0, 8), 116, 8, 'ascii');
  h.write(octal(dir ? 0 : size, 12), 124, 12, 'ascii');
  h.write(octal(Math.floor(mtime / 1000), 12), 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii'); // la suma de control se calcula con este campo en blanco
  h.write(dir ? '5' : '0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/** Lista (ruta relativa con «/») de lo que hay que copiar, sin entrar en `skipDir` ni en temporales. */
function collect(root, skipDir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(abs, ent.name);
      if (skipDir && path.resolve(p) === path.resolve(skipDir)) continue;
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        out.push({ rel: r, abs: p, dir: true });
        walk(p, r);
      } else if (ent.isFile() && !ent.name.endsWith('.partial') && !ent.name.endsWith('.tmp')) out.push({ rel: r, abs: p, dir: false });
    }
  };
  walk(root, '');
  return out;
}

async function* tarStream(entries) {
  for (const e of entries) {
    let st;
    try {
      st = fs.statSync(e.abs);
    } catch {
      continue; // desapareció mientras se copiaba (p. ej. una nota enviada a la papelera y purgada)
    }
    if (e.dir) {
      yield header(e.rel, { dir: true, mtime: st.mtimeMs });
      continue;
    }
    yield header(e.rel, { size: st.size, mtime: st.mtimeMs });
    // se lee exactamente `size` bytes: si el archivo cambia a mitad, la copia sigue siendo un tar válido
    const fh = await fs.promises.open(e.abs, 'r');
    try {
      let left = st.size;
      while (left > 0) {
        const buf = Buffer.alloc(Math.min(left, 1 << 20));
        const { bytesRead } = await fh.read(buf, 0, buf.length, st.size - left);
        yield bytesRead === buf.length ? buf : Buffer.concat([buf.subarray(0, bytesRead), Buffer.alloc(buf.length - bytesRead)]);
        left -= buf.length;
      }
    } finally {
      await fh.close();
    }
    const rest = st.size % BLOCK;
    if (rest) yield Buffer.alloc(BLOCK - rest);
  }
  yield Buffer.alloc(BLOCK * 2);
}

/** Crea `destFile` (.tar.gz) con todo el contenido de `srcDir`. Escribe en un .partial y lo renombra al terminar. */
async function createTarGz(srcDir, destFile, { skipDir } = {}) {
  const entries = collect(srcDir, skipDir);
  const tmp = `${destFile}.partial`;
  try {
    await pipeline(Readable.from(tarStream(entries)), zlib.createGzip({ level: 6 }), fs.createWriteStream(tmp));
    fs.renameSync(tmp, destFile);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return destFile;
}

/** Descomprime un .tar.gz de Libreta en `destDir` (vacío o nuevo). Rechaza rutas que se salgan de la carpeta. */
function extractTarGz(file, destDir) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const root = path.resolve(destDir);
  fs.mkdirSync(root, { recursive: true });
  let pos = 0;
  while (pos + BLOCK <= buf.length) {
    const h = buf.subarray(pos, pos + BLOCK);
    pos += BLOCK;
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.toString('utf8', a, b).replace(/\0.*$/s, '');
    const name = str(345, 500) ? `${str(345, 500)}/${str(0, 100)}` : str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const isDir = h[156] === 0x35;
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Ruta no permitida en la copia: ${name}`);
    if (isDir) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf.subarray(pos, pos + size));
    }
    pos += Math.ceil(size / BLOCK) * BLOCK;
  }
  return root;
}

/** Deja solo las `keep` copias más recientes (por nombre, que lleva la fecha). Nunca toca otros archivos. */
function pruneBackups(dir, keep) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => NAME_RE.test(n));
  } catch {
    return [];
  }
  const old = names.sort().reverse().slice(Math.max(1, keep));
  for (const n of old) fs.rmSync(path.join(dir, n), { force: true });
  return old;
}

/** Hace una copia ahora y poda las antiguas. Devuelve { file, size, pruned }. */
async function runBackup({ vaultDir, destDir, keep = DEFAULTS.keep, now = new Date() }) {
  if (!destDir) throw new Error('No hay carpeta de destino.');
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, backupName(now));
  await createTarGz(vaultDir, file, { skipDir: destDir });
  const pruned = pruneBackups(destDir, keep);
  return { file, size: fs.statSync(file).size, pruned };
}

module.exports = { DEFAULTS, KEEP_CHOICES, NAME_RE, sanitizeConfig, isDue, backupName, createTarGz, extractTarGz, pruneBackups, runBackup };
