const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, sanitize, withDefaults } = require('../main/prefs');

test('valores válidos se conservan', () => {
  assert.deepEqual(sanitize({ theme: 'dark', accent: 'verde', font: 'mono', size: 19, width: 'wide' }),
    { theme: 'dark', accent: 'verde', font: 'mono', size: 19, width: 'wide' });
});

test('valores inválidos y campos desconocidos se descartan', () => {
  assert.deepEqual(sanitize({ theme: 'neon', accent: 5, size: 99, extra: 'x', font: 'sans' }), { font: 'sans' });
});

test('sin datos se usan los valores por defecto', () => {
  assert.deepEqual(withDefaults(undefined), DEFAULTS);
  assert.deepEqual(withDefaults({ theme: 'light' }), { ...DEFAULTS, theme: 'light' });
});

test('un settings.json dañado no rompe nada', () => {
  assert.deepEqual(withDefaults('texto'), DEFAULTS);
  assert.deepEqual(withDefaults(null), DEFAULTS);
});
