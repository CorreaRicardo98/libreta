const test = require('node:test');
const assert = require('node:assert/strict');

const ctx = { folderPath: (id) => ({ f1: 'Trabajo › Clientes', f2: 'Notas' })[id] };
const N = (id, title, text, extra = {}) => ({ id, title, text, tags: [], folderId: 'f2', updated: Date.parse('2026-05-10'), flags: {}, ...extra });
const notes = [
  N('a', 'Reunión semanal', 'Revisar presupuesto con el cliente y llamar a María', { folderId: 'f1', flags: { tasks: true }, tags: ['trabajo'] }),
  N('b', 'Lista de compras', 'Plátanos, aguacate, café #super', { tags: ['super'], pinned: true }),
  N('c', 'Viaje a Oaxaca', 'Boletos de avión y hotel. Mezcal.', { flags: { images: true }, updated: Date.parse('2025-01-02') }),
];

async function ids(q) {
  const { search } = await import('../src/search.js');
  return search(notes, q, ctx)
    .map((h) => h.note.id)
    .join(',');
}

test('ignora acentos y mayúsculas', async () => {
  assert.equal(await ids('REUNION'), 'a');
});
test('tolera errores de escritura', async () => {
  assert.equal(await ids('presupesto'), 'a');
});
test('encuentra por prefijo', async () => {
  assert.equal(await ids('aguacat'), 'b');
});
test('frases exactas', async () => {
  assert.equal(await ids('"avión y hotel"'), 'c');
});
test('filtro tag:', async () => {
  assert.equal(await ids('tag:super'), 'b');
});
test('filtro carpeta:', async () => {
  assert.equal(await ids('carpeta:clientes'), 'a');
});
test('filtro tiene:', async () => {
  assert.equal(await ids('tiene:imagen'), 'c');
});
test('filtro es:fijada', async () => {
  assert.equal(await ids('es:fijada'), 'b');
});
test('filtro antes:', async () => {
  assert.equal(await ids('antes:2026-01-01'), 'c');
});
test('excluir con -', async () => {
  assert.equal(await ids('compras -cafe'), '');
});
test('sin coincidencias', async () => {
  assert.equal(await ids('zzzz'), '');
});
