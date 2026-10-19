const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer } = require('../main/version');

test('detecta versiones posteriores', () => {
  assert.equal(isNewer('1.3.1', '1.3.0'), true);
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
});
test('no marca como nuevas las iguales ni las anteriores', () => {
  assert.equal(isNewer('1.3.0', '1.3.0'), false);
  assert.equal(isNewer('1.2.9', '1.3.0'), false);
});
test('acepta el prefijo v de las etiquetas de GitHub', () => {
  assert.equal(isNewer('v1.4.0', '1.3.0'), true);
  assert.equal(isNewer('v1.3.0', '1.3.0'), false);
});
