const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { Store } = require('../main/store');
const backup = require('../main/backup');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'libreta-bk-'));

/** { ruta/relativa: contenido } de todos los archivos bajo `root`. */
function snapshot(root, skip) {
  const out = {};
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, e.name);
      if (skip && p === skip) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else out[r] = fs.readFileSync(p).toString('base64');
    }
  };
  walk(root, '');
  return out;
}

function sampleVault() {
  const dir = tmp();
  const s = new Store(dir);
  const a = s.create();
  s.save({ id: a.id, title: 'Plan', html: '<p>hola ñandú</p>', text: 'hola ñandú' });
  s.save({ id: a.id, title: 'Plan 2', html: '<p>dos</p>', text: 'dos' });
  const b = s.create();
  s.save({ id: b.id, title: 'Secreto ultra', html: '<p>contenido-secreto-9876</p>', text: 'contenido-secreto-9876' });
  s.lockNote(b.id, 'pw');
  s.saveTemplate({ name: 'Reunión', html: '<h1>Reunión</h1>' });
  fs.writeFileSync(path.join(dir, 'attachments', 'grande.bin'), Buffer.alloc(1_300_000, 7)); // más de un bloque de lectura (1 MiB)
  fs.mkdirSync(path.join(dir, 'attachments', 'vacia'));
  return { dir, s, a, b };
}

test('la copia se crea y se restaura en una carpeta vacía con el mismo contenido', async () => {
  const { dir } = sampleVault();
  const dest = tmp();
  const { file, size } = await backup.runBackup({ vaultDir: dir, destDir: dest, keep: 5 });
  assert.match(path.basename(file), backup.NAME_RE);
  assert.ok(size > 0);
  const restored = tmp();
  backup.extractTarGz(file, restored);
  assert.deepEqual(snapshot(restored), snapshot(dir));
  assert.ok(fs.existsSync(path.join(restored, 'attachments', 'vacia')), 'las carpetas vacías también');
});

test('las notas bloqueadas siguen cifradas dentro de la copia', async () => {
  const { dir, s, b } = sampleVault();
  const dest = tmp();
  const { file } = await backup.runBackup({ vaultDir: dir, destDir: dest });
  const plano = zlib.gunzipSync(fs.readFileSync(file)).toString('latin1');
  assert.equal(plano.includes('contenido-secreto-9876'), false);
  assert.equal(plano.includes('Secreto ultra'), false);
  const restored = tmp();
  backup.extractTarGz(file, restored);
  const s2 = new Store(restored);
  assert.equal(s2.unlockNote(b.id, 'mala'), null);
  assert.equal(s2.unlockNote(b.id, 'pw').title, 'Secreto ultra', 'con la contraseña se abre igual en la copia');
  assert.ok(s);
});

test('el archivo es un tar.gz válido para herramientas externas', async (t) => {
  const { dir } = sampleVault();
  const dest = tmp();
  const { file } = await backup.runBackup({ vaultDir: dir, destDir: dest });
  const r = spawnSync('tar', ['-tzf', file], { encoding: 'utf8' });
  if (r.error) return t.skip('tar no está disponible');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('folders.json'));
  assert.ok(r.stdout.split('\n').some((l) => l.startsWith('notes/')));
});

test('rutas largas (más de 100 bytes) se guardan con prefijo y se restauran', async () => {
  const dir = tmp();
  const deep = path.join(dir, 'a'.repeat(60), 'b'.repeat(60), 'c.txt');
  fs.mkdirSync(path.dirname(deep), { recursive: true });
  fs.writeFileSync(deep, 'largo');
  const dest = tmp();
  const { file } = await backup.runBackup({ vaultDir: dir, destDir: dest });
  const restored = tmp();
  backup.extractTarGz(file, restored);
  assert.equal(fs.readFileSync(path.join(restored, 'a'.repeat(60), 'b'.repeat(60), 'c.txt'), 'utf8'), 'largo');
});

test('si la carpeta de copias está dentro de la bóveda no se copia a sí misma', async () => {
  const { dir } = sampleVault();
  const dest = path.join(dir, 'copias');
  await backup.runBackup({ vaultDir: dir, destDir: dest });
  const { file } = await backup.runBackup({ vaultDir: dir, destDir: dest, now: new Date(Date.now() + 5000) });
  const restored = tmp();
  backup.extractTarGz(file, restored);
  assert.equal(fs.existsSync(path.join(restored, 'copias')), false);
});

test('se conservan solo las últimas N copias y nunca se borran otros archivos', () => {
  const dest = tmp();
  for (let d = 1; d <= 6; d++) fs.writeFileSync(path.join(dest, backup.backupName(new Date(2026, 0, d, 10, 0, 0))), 'x');
  fs.writeFileSync(path.join(dest, 'foto.jpg'), 'no tocar');
  fs.writeFileSync(path.join(dest, 'libreta-notas-importantes.tar.gz'), 'no tocar');
  const borradas = backup.pruneBackups(dest, 3);
  assert.equal(borradas.length, 3);
  const quedan = fs.readdirSync(dest).sort();
  assert.deepEqual(quedan, ['foto.jpg', 'libreta-2026-01-04-100000.tar.gz', 'libreta-2026-01-05-100000.tar.gz', 'libreta-2026-01-06-100000.tar.gz', 'libreta-notas-importantes.tar.gz']);
});

test('prune nunca deja cero copias aunque keep sea 0 o inválido', () => {
  const dest = tmp();
  fs.writeFileSync(path.join(dest, backup.backupName(new Date(2026, 0, 1))), 'x');
  fs.writeFileSync(path.join(dest, backup.backupName(new Date(2026, 0, 2))), 'x');
  backup.pruneBackups(dest, 0);
  assert.equal(fs.readdirSync(dest).length, 1);
});

test('configuración: valores inválidos vuelven a los de fábrica y se calcula cuándo toca', () => {
  assert.deepEqual(backup.sanitizeConfig(null), backup.DEFAULTS);
  const c = backup.sanitizeConfig({ enabled: 'sí', dir: 'relativa', every: 'cada rato', keep: 99, last: -5, lastError: 7 });
  assert.deepEqual(c, backup.DEFAULTS);
  const ok = backup.sanitizeConfig({ enabled: true, dir: path.resolve('/tmp/x'), every: 'weekly', keep: 14, last: 1000 });
  assert.equal(ok.every, 'weekly');
  assert.equal(ok.keep, 14);
  const t0 = Date.parse('2026-03-10T10:00:00Z');
  const daily = backup.sanitizeConfig({ enabled: true, dir: path.resolve('/tmp/x'), every: 'daily', last: t0 });
  assert.equal(backup.isDue(daily, t0 + 3600e3), false);
  assert.equal(backup.isDue(daily, t0 + 24 * 3600e3), true);
  assert.equal(backup.isDue({ ...daily, enabled: false }, t0 + 99e9), false);
  assert.equal(backup.isDue({ ...daily, dir: '' }, t0 + 99e9), false);
});

test('al restaurar se rechazan rutas que se salen de la carpeta', () => {
  const dir = tmp();
  const evil = path.join(dir, 'evil.tar.gz');
  const h = Buffer.alloc(512);
  h.write('../fuera.txt', 0, 100, 'utf8');
  h.write('0000644\0', 100, 8);
  h.write('00000000002\0', 124, 12);
  h.write('0\0', 156, 1);
  fs.writeFileSync(evil, zlib.gzipSync(Buffer.concat([h, Buffer.alloc(512), Buffer.alloc(1024)])));
  assert.throws(() => backup.extractTarGz(evil, path.join(dir, 'destino')), /no permitida/);
  assert.equal(fs.existsSync(path.join(dir, 'fuera.txt')), false);
});
