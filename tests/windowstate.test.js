const test = require('node:test');
const assert = require('node:assert/strict');
const ws = require('../main/windowstate');

const screens = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];

test('sin datos guardados usa el tamaño por defecto', () => {
  assert.deepEqual(ws.restore(undefined, screens), { width: 1180, height: 760, maximized: false });
  assert.deepEqual(ws.restore('basura', screens), { width: 1180, height: 760, maximized: false });
});

test('restaura tamaño, posición y maximizada', () => {
  const r = ws.restore({ x: 100, y: 50, width: 1000, height: 700, maximized: true }, screens);
  assert.deepEqual(r, { x: 100, y: 50, width: 1000, height: 700, maximized: true });
});

test('posición fuera de las pantallas: conserva tamaño y descarta posición', () => {
  const r = ws.restore({ x: 4000, y: 100, width: 1000, height: 700 }, screens);
  assert.deepEqual(r, { width: 1000, height: 700, maximized: false });
});

test('respeta el mínimo y valores no numéricos', () => {
  assert.equal(ws.restore({ width: 100, height: 100 }, screens).width, 720);
  assert.deepEqual(ws.restore({ width: 'x', height: 700 }, screens), { width: 1180, height: 760, maximized: false });
});

test('con un segundo monitor la posición es válida', () => {
  const two = [...screens, { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }];
  assert.equal(ws.restore({ x: 2500, y: 0, width: 800, height: 600 }, two).x, 2500);
});
