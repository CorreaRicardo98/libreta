const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const importer = require('../main/importer');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libreta-imp-'));
  return { dir, store: new Store(path.join(dir, 'vault')), src: path.join(dir, 'src') };
}

test('Markdown: título, etiquetas, tareas y subcarpetas', () => {
  const { store, src } = sandbox();
  fs.mkdirSync(path.join(src, 'Diario'), { recursive: true });
  fs.writeFileSync(path.join(src, 'Diario', 'viaje.md'), '---\ntags: [viajes]\n---\n# Plan\n\n- [ ] pasaporte\n- [x] boletos\n');
  const { items } = importer.importFolder(store, src);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Plan');
  assert.deepEqual(items[0].tags, ['viajes']);
  assert.deepEqual(items[0].folder.slice(1), ['Diario']);
  assert.match(items[0].html, /data-type="taskList"/);
  assert.match(items[0].html, /data-checked="true"/);
});

test('Markdown: las imágenes locales se copian a los adjuntos', () => {
  const { store, src } = sandbox();
  fs.mkdirSync(path.join(src, '_resources'), { recursive: true });
  fs.writeFileSync(path.join(src, '_resources', 'foto.png'), Buffer.from([137, 80, 78, 71]));
  fs.writeFileSync(path.join(src, 'n.md'), '# N\n\n![f](_resources/foto.png)\n');
  const { items } = importer.importFolder(store, src);
  assert.match(items[0].html, /libreta:\/\/att\/[\w-]+\.png/);
  assert.equal(fs.readdirSync(store.attDir).length, 1);
});

test('Evernote: etiquetas, fechas y recursos por hash md5', () => {
  const { store, dir } = sandbox();
  const enex = path.join(dir, 'Cocina.enex');
  fs.writeFileSync(enex, `<?xml version="1.0"?><en-export><note><title>Receta</title><content><![CDATA[<en-note><div>Harina</div><en-media hash="5a105e8b9d40e1329780d62ea2265d8a" type="text/plain"/></en-note>]]></content><created>20240105T101500Z</created><updated>20240106T101500Z</updated><tag>cocina</tag><resource><data encoding="base64">dGVzdDE=</data><mime>text/plain</mime><resource-attributes><file-name>nota.txt</file-name></resource-attributes></resource></note></en-export>`);
  const { items } = importer.importEnex(store, enex);
  assert.equal(items[0].title, 'Receta');
  assert.deepEqual(items[0].tags, ['cocina']);
  assert.equal(items[0].created, Date.UTC(2024, 0, 5, 10, 15, 0));
  assert.match(items[0].html, /data-type="attachment"/);
});
