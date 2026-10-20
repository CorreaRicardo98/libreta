// Importadores: Markdown, texto y HTML (Joplin, Obsidian, Bear, Notion, Apple Notes exportado con
// herramientas de terceros…) y archivos .enex de Evernote.
// Cada importador devuelve notas { title, html, created, updated, folder: [segmentos], tags }
// y deja los adjuntos ya copiados en la carpeta de la bóveda (libreta://att/…).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { marked } = require('marked');

const MD_EXT = new Set(['.md', '.markdown', '.txt']);
const HTML_EXT = new Set(['.html', '.htm']);
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const MAX_FILES = 20000;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

/** Copia un archivo a los adjuntos y devuelve el HTML que lo representa (imagen o tarjeta). */
function attachFile(store, file, alt) {
  const bytes = fs.readFileSync(file);
  const url = `libreta://att/${store.saveAttachment(path.basename(file), bytes)}`;
  const name = path.basename(file);
  if (IMG_EXT.has(path.extname(file).toLowerCase())) return { url, img: true, html: `<img src="${url}" alt="${esc(alt || name)}">` };
  return { url, img: false, html: `<div data-type="attachment" data-src="${url}" data-name="${esc(name)}" data-size="${bytes.length}"></div>` };
}

/** Busca un archivo referenciado: primero relativo a la nota y luego por nombre en toda la carpeta. */
function makeResolver(root, files) {
  const byName = new Map();
  for (const f of files) if (!byName.has(path.basename(f).toLowerCase())) byName.set(path.basename(f).toLowerCase(), f);
  return (fromDir, ref) => {
    let r = String(ref).split('#')[0].split('?')[0];
    try { r = decodeURIComponent(r); } catch { /* ya estaba decodificado */ }
    if (!r || /^(https?:|data:|mailto:|libreta:)/i.test(r)) return null;
    const direct = path.resolve(fromDir, r);
    if (direct.startsWith(root) && fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    return byName.get(path.basename(r).toLowerCase()) || null;
  };
}

function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { body: text, meta: {} };
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (!v) { const items = []; while (/^\s*-\s+/.test(lines[i + 1] || '')) items.push(lines[++i].replace(/^\s*-\s+/, '').trim()); v = items; }
    else if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim());
    meta[kv[1].toLowerCase()] = v;
  }
  return { body: text.slice(m[0].length), meta };
}

const tagList = (meta) => []
  .concat(meta.tags || meta.tag || [])
  .flatMap((t) => String(t).split(/[,\s]+/))
  .map((t) => t.replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, ''))
  .filter((t) => /^\p{L}/u.test(t));

/** marked escribe las tareas como <input type=checkbox>; el editor espera su propio formato de lista de tareas. */
function fixMarkup(html) {
  html = html.replace(/<ul>((?:(?!<\/ul>)[\s\S])*?<li>\s*(?:<p>)?\s*<input\b[^>]*type="checkbox"[\s\S]*?)<\/ul>/g, (_m, inner) => {
    const items = inner.replace(/<li>\s*(?:<p>)?\s*(?:<input\b([^>]*)>)?\s*([\s\S]*?)(?:<\/p>)?\s*<\/li>/g,
      (_i, attrs, text) => `<li data-type="taskItem" data-checked="${/\bchecked\b/.test(attrs || '')}"><div><p>${text.trim()}</p></div></li>`);
    return `<ul data-type="taskList">${items}</ul>`;
  });
  // un adjunto no puede ir dentro de un párrafo
  return html.replace(/<p>\s*(<div data-type="attachment"[^>]*><\/div>)\s*<\/p>/g, '$1');
}

function rewriteMedia(html, dir, resolve, store) {
  // <img src> y enlaces locales a archivos
  html = html.replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi, (m, src) => {
    const f = resolve(dir, src);
    if (!f) return m;
    try { return attachFile(store, f, (/alt="([^"]*)"/i.exec(m) || [])[1]).html; } catch { return m; }
  });
  html = html.replace(/<a\b[^>]*?\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    if (/\.(md|markdown|txt|html?)$/i.test(href.split('#')[0])) return inner; // enlace a otra nota: queda el texto
    const f = resolve(dir, href);
    if (!f) return m;
    try { return attachFile(store, f).html; } catch { return m; }
  });
  return html;
}

function importFiles(store, files, root, resolve, folderOf) {
  const items = [];
  const skipped = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const isMd = MD_EXT.has(ext);
    const isHtml = HTML_EXT.has(ext);
    if (!isMd && !isHtml) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const st = fs.statSync(file);
      const base = path.basename(file, ext);
      let html;
      let meta = {};
      let title = base;
      if (isMd) {
        const fm = frontMatter(raw);
        meta = fm.meta;
        const h1 = /^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/.exec(fm.body);
        title = String(meta.title || (h1 && h1[1]) || base);
        // Obsidian: ![[imagen.png]] -> imagen estándar
        const body = fm.body.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_m, f) => `![${f}](${encodeURI(f)})`);
        html = ext === '.txt'
          ? body.split(/\r?\n\r?\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
          : marked.parse(body, { gfm: true, breaks: false });
      } else {
        const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
        if (t && t[1].trim()) title = t[1].trim();
        html = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(raw) || [null, raw])[1]
          .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
      }
      html = fixMarkup(rewriteMedia(html, path.dirname(file), resolve, store));
      const tags = tagList(meta);
      items.push({
        title, html, tags,
        created: Math.round(st.birthtimeMs && st.birthtimeMs > 0 ? Math.min(st.birthtimeMs, st.mtimeMs) : st.mtimeMs),
        updated: Math.round(st.mtimeMs),
        folder: folderOf(file),
      });
    } catch (e) { skipped.push(`${path.basename(file)}: ${e.message}`); }
  }
  return { items, skipped };
}

/** Una carpeta completa (con subcarpetas): cada subcarpeta pasa a ser una carpeta de Libreta. */
function importFolder(store, dir) {
  const root = path.resolve(dir);
  const files = walk(root);
  const resolve = makeResolver(root, files);
  const rootName = path.basename(root);
  return importFiles(store, files, root, resolve, (file) => [rootName, ...path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean)]);
}

/** Archivos sueltos. */
function importLoose(store, list, folderName = 'Importadas') {
  const files = list.map((f) => path.resolve(f));
  const rootDirs = [...new Set(files.map((f) => path.dirname(f)))];
  const resolvers = new Map(rootDirs.map((d) => [d, makeResolver(d, walk(d).slice(0, 2000))]));
  const merged = { items: [], skipped: [] };
  for (const f of files) {
    const d = path.dirname(f);
    const r = importFiles(store, [f], d, resolvers.get(d), () => [folderName]);
    merged.items.push(...r.items);
    merged.skipped.push(...r.skipped);
  }
  return merged;
}

// ---- Evernote (.enex)
const enexDate = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || '').trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
};
const xmlText = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? m[1] : ''; };

function importEnex(store, file) {
  const xml = fs.readFileSync(file, 'utf8');
  const folder = [path.basename(file, path.extname(file))];
  const items = [];
  const skipped = [];
  for (const m of xml.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
    try {
      const note = m[1];
      const title = xmlText(tag(note, 'title')).trim() || 'Nota sin título';
      // recursos: se indexan por el md5 de su contenido, que es como los cita el texto (<en-media hash>)
      const media = new Map();
      for (const r of note.matchAll(/<resource>([\s\S]*?)<\/resource>/g)) {
        const data = tag(r[1], 'data');
        if (!data) continue;
        const bytes = Buffer.from(data.replace(/\s+/g, ''), 'base64');
        const mime = xmlText(tag(r[1], 'mime')).trim();
        const fname = xmlText(tag(r[1], 'file-name')).trim() || `adjunto.${(mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '')}`;
        const url = `libreta://att/${store.saveAttachment(fname, bytes)}`;
        media.set(crypto.createHash('md5').update(bytes).digest('hex'), { url, mime, fname, size: bytes.length });
      }
      let body = xmlText(tag(note, 'content'))
        .replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<\/?en-note[^>]*>/gi, '')
        .replace(/<en-todo\s+checked="true"\s*\/?>/gi, '☑ ').replace(/<en-todo[^>]*\/?>/gi, '☐ ')
        .replace(/<en-media\b([^>]*?)\/?>(\s*<\/en-media>)?/gi, (_m, attrs) => {
          const hash = (/hash="([^"]+)"/i.exec(attrs) || [])[1];
          const r = media.get(hash);
          if (!r) return '';
          return r.mime.startsWith('image/')
            ? `<img src="${r.url}" alt="${esc(r.fname)}">`
            : `<div data-type="attachment" data-src="${r.url}" data-name="${esc(r.fname)}" data-size="${r.size}"></div>`;
        });
      const tags = [...note.matchAll(/<tag>([\s\S]*?)<\/tag>/g)]
        .map((t) => xmlText(t[1]).trim().replace(/[^\p{L}\p{N}_-]/gu, '')).filter((t) => /^\p{L}/u.test(t));
      items.push({ title, html: body, tags, created: enexDate(tag(note, 'created')), updated: enexDate(tag(note, 'updated')), folder });
    } catch (e) { skipped.push(e.message); }
  }
  return { items, skipped };
}

module.exports = { importFolder, importLoose, importEnex };
