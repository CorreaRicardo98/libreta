const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'src', 'locales');
const load = (l) => JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'));
const es = load('es');
const en = load('en');
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('español e inglés tienen exactamente las mismas claves', () => {
  const onlyEs = Object.keys(es).filter((k) => !(k in en));
  const onlyEn = Object.keys(en).filter((k) => !(k in es));
  assert.deepEqual({ onlyEs, onlyEn }, { onlyEs: [], onlyEn: [] });
});

test('ninguna traducción está vacía', () => {
  for (const [lang, d] of [['es', es], ['en', en]]) {
    for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.length > 0, `${lang}: «${k}» está vacía`);
  }
});

test('las variables {x} coinciden entre idiomas', () => {
  for (const k of Object.keys(es)) assert.equal(vars(en[k]), vars(es[k]), `variables distintas en «${k}»`);
});

test('cada plural «.one» tiene su «.other» en los dos idiomas', () => {
  for (const d of [es, en]) {
    for (const k of Object.keys(d).filter((x) => x.endsWith('.one'))) assert.ok(`${k.slice(0, -4)}.other` in d, `falta ${k.slice(0, -4)}.other`);
  }
});

test('el inglés no deja palabras en español', () => {
  const spanish = /\b(el|la|los|las|del|que|para|con|una|tus|tu|nota|notas|carpeta|carpetas|archivo|archivos|esta|este)\b|[áéíóúñ¿¡«»]/i;
  const allowed = new Set(['set.language.es']); // «Español» se escribe en su propio idioma
  for (const [k, v] of Object.entries(en)) {
    if (allowed.has(k)) continue;
    assert.ok(!spanish.test(v), `«${k}» parece estar en español: ${v}`);
  }
});

test('todas las claves usadas con t(\'clave\') existen', () => {
  const roots = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'main')];
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'locales' && f.name !== 'public') walk(p); } else if (/\.(js|html)$/.test(f.name) && f.name !== 'i18n.js') files.push(p); } }; // i18n.js solo menciona t('clave') en comentarios
  roots.forEach(walk);
  const missing = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const rx = /(?:\b(?:t|tr|T|tn)\(|data-i18n(?:-title|-label|-ph)?=")'?([a-z][\w.]*)['"]/gi;
    for (const m of text.matchAll(rx)) {
      const key = m[1];
      const plural = key in es || `${key}.one` in es; // tn('x') usa x.one / x.other
      if (!plural) missing.push(`${path.relative(path.join(__dirname, '..'), f)}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('el idioma del sistema se resuelve a español o inglés', () => {
  const { resolveLang } = require('../main/i18n');
  assert.equal(resolveLang('system', 'es-MX'), 'es');
  assert.equal(resolveLang('system', 'es'), 'es');
  assert.equal(resolveLang('system', 'en-US'), 'en');
  assert.equal(resolveLang('system', 'fr-FR'), 'en');
  assert.equal(resolveLang('es', 'en-US'), 'es');
  assert.equal(resolveLang('en', 'es-MX'), 'en');
});

test('el traductor interpola variables y cae al español si falta una clave', () => {
  const { translator } = require('../main/i18n');
  const t = translator('en');
  assert.equal(t('toast.moved', { name: 'Work' }), 'Moved to “Work”');
  assert.equal(t('clave.que.no.existe'), 'clave.que.no.existe');
});
