// Búsqueda: sin acentos ni mayúsculas, tolerante a errores de escritura, con filtros y frases.
//   tag:ideas  carpeta:trabajo  tiene:imagen|tareas|adjunto|tabla|enlace  es:fijada|bloqueada
//   antes:2026-01-31  despues:2026-01-01  "frase exacta"  -excluir

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const FILTER_KEYS = {
  tag: 'tag',
  etiqueta: 'tag',
  carpeta: 'folder',
  folder: 'folder',
  tiene: 'has',
  has: 'has',
  es: 'is',
  is: 'is',
  antes: 'before',
  before: 'before',
  despues: 'after',
  after: 'after',
};

export function parseQuery(q) {
  const out = { terms: [], phrases: [], not: [], filters: [] };
  for (const m of String(q).matchAll(/([\p{L}]+):"([^"]+)"|([\p{L}]+):(\S+)|"([^"]+)"|(\S+)/gu)) {
    const key = norm(m[1] || m[3] || '');
    const val = norm(m[2] || m[4] || '');
    if (key && FILTER_KEYS[key] && val) out.filters.push([FILTER_KEYS[key], val]);
    else if (m[5]) out.phrases.push(norm(m[5]));
    else {
      const w = norm(m[6] || m[0]);
      if (w.startsWith('-') && w.length > 1) out.not.push(w.slice(1));
      else if (w) out.terms.push(w);
    }
  }
  return out;
}

export const isEmptyQuery = (p) => !p.terms.length && !p.phrases.length && !p.not.length && !p.filters.length;

// ---- índice por nota, recalculado solo cuando la nota cambia
const cache = new Map();
function index(n) {
  const hit = cache.get(n.id);
  if (hit && hit.u === n.updated && hit.l === !!n.locked) return hit;
  const title = norm(n.title);
  const body = norm(n.text);
  const uniq = (s) => [...new Set(s.split(/[^\p{L}\p{N}_#]+/u).filter((w) => w.length > 2))].slice(0, 1500);
  const e = { u: n.updated, l: !!n.locked, title, body, titleWords: uniq(title), words: uniq(body) };
  cache.set(n.id, e);
  return e;
}

/** Distancia de edición acotada: devuelve > max en cuanto se pasa. */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const wordStart = (hay, term) => hay.startsWith(term) || hay.includes(` ${term}`) || hay.includes(`\n${term}`);

function termScore(e, term) {
  let s = 0;
  if (e.title.includes(term)) s += wordStart(e.title, term) ? 15 : 8;
  if (e.body.includes(term)) s += wordStart(e.body, term) ? 4 : 2;
  if (s) return s;
  if (term.length < 4) return 0;
  const max = term.length >= 8 ? 2 : 1;
  if (e.titleWords.some((w) => within(term, w, max) || (w.length > term.length && within(term, w.slice(0, term.length), max)))) return 5;
  if (e.words.some((w) => within(term, w, max))) return 1.5;
  return 0;
}

const HAS = {
  imagen: 'images',
  imagenes: 'images',
  foto: 'images',
  fotos: 'images',
  image: 'images',
  images: 'images',
  tarea: 'tasks',
  tareas: 'tasks',
  task: 'tasks',
  tasks: 'tasks',
  adjunto: 'files',
  adjuntos: 'files',
  archivo: 'files',
  archivos: 'files',
  file: 'files',
  files: 'files',
  attachment: 'files',
  attachments: 'files',
  tabla: 'tables',
  tablas: 'tables',
  table: 'tables',
  tables: 'tables',
};

function filterOk(n, [kind, val], ctx) {
  switch (kind) {
    case 'tag':
      return (n.tags || []).some((t) => norm(t) === val.replace(/^#/, ''));
    case 'folder':
      return norm(ctx.folderPath(n.folderId)).includes(val);
    case 'has':
      if (/^(enlace|enlaces|link|links)$/.test(val)) return !!n.links?.length;
      return !!(HAS[val] && n.flags?.[HAS[val]]);
    case 'is':
      if (/^(fijada|fijadas|pinned)$/.test(val)) return !!n.pinned;
      if (/^(bloqueada|bloqueadas|locked)$/.test(val)) return !!n.locked;
      return false;
    case 'before': {
      const t = Date.parse(val);
      return !Number.isNaN(t) && n.updated < t;
    }
    case 'after': {
      const t = Date.parse(val);
      return !Number.isNaN(t) && n.updated >= t;
    }
    default:
      return false;
  }
}

/** Devuelve 0 si la nota no coincide, o una puntuación mayor que 0. */
export function score(n, p, ctx) {
  for (const f of p.filters) if (!filterOk(n, f, ctx)) return 0;
  const e = index(n);
  let total = p.filters.length ? 1 : 0;
  for (const t of p.terms) {
    const s = termScore(e, t);
    if (!s) return 0;
    total += s;
  }
  for (const ph of p.phrases) {
    if (!e.title.includes(ph) && !e.body.includes(ph)) return 0;
    total += e.title.includes(ph) ? 20 : 6;
  }
  for (const x of p.not) if (e.title.includes(x) || e.body.includes(x)) return 0;
  if (n.tags?.length) for (const t of p.terms) if (n.tags.some((g) => norm(g) === t.replace(/^#/, ''))) total += 6;
  return total || (p.not.length ? 1 : 0);
}

export function matches(n, q, ctx) {
  const p = parseQuery(q);
  return isEmptyQuery(p) ? true : score(n, p, ctx) > 0;
}

/** Notas que coinciden, de más a menos relevante, con un fragmento donde aparece la búsqueda. */
export function search(notes, q, ctx) {
  const p = parseQuery(q);
  if (isEmptyQuery(p)) return [];
  const hits = [];
  for (const n of notes) {
    const s = score(n, p, ctx);
    if (s > 0) hits.push({ note: n, score: s, snippet: snippet(n, p) });
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updated - a.note.updated);
}

function snippet(n, p) {
  if (!n.text) return '';
  const text = n.text.replace(/\s+/g, ' ');
  const hay = norm(text);
  const needles = [...p.phrases, ...p.terms];
  let at = -1;
  for (const t of needles) {
    at = hay.indexOf(t);
    if (at >= 0) break;
  }
  if (at < 0) return '';
  const from = Math.max(0, at - 40);
  return (from > 0 ? '…' : '') + text.slice(from, from + 130);
}
