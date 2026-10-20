const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'libreta-'));

test('crea, guarda y lee una nota', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'Hola', html: '<p>Hola</p>', text: 'Hola', tags: [] });
  assert.equal(s.get(n.id).title, 'Hola');
  assert.equal(s.list().length, 1);
});

test('la lista no incluye el HTML y calcula banderas y enlaces', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'T', text: 'T', html: '<ul data-type="taskList"></ul><a data-note-link="abc-1">x</a>' });
  const [meta] = s.list();
  assert.equal(meta.html, undefined);
  assert.equal(meta.flags.tasks, true);
  assert.deepEqual(meta.links, ['abc-1']);
});

test('las carpetas se anidan, se mueven sin ciclos y se borran con sus hijas', () => {
  const s = new Store(tmp());
  const root = s.listFolders()[0].id;
  const a = s.createFolder('A', root);
  const b = s.createFolder('B', a.id);
  const moved = s.moveFolder(a.id, b.id); // A dentro de su propia hija: debe ignorarse
  assert.equal(moved.find((f) => f.id === a.id).parentId, root);
  const note = s.create(b.id);
  s.deleteFolder(a.id);
  assert.equal(s.listFolders().length, 1);
  assert.ok(s.get(note.id).deletedAt, 'la nota va a la papelera');
});

test('nota bloqueada: cifrada en disco, contraseña incorrecta rechazada', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'Secreto', html: '<p>clave</p>', text: 'clave' });
  s.lockNote(n.id, 'pw');
  assert.equal(fs.readFileSync(s._notePath(n.id), 'utf8').includes('Secreto'), false);
  assert.equal(s.get(n.id).html, null);
  assert.equal(s.unlockNote(n.id, 'mala'), null);
  assert.equal(s.unlockNote(n.id, 'pw').title, 'Secreto');
  s.relock(n.id);
  assert.equal(s.save({ id: n.id, html: 'x' }), null, 'sin clave no se escribe');
});

test('historial: guarda versiones espaciadas y restaura', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'v1', html: '<p>uno</p>', text: 'uno' });
  s.save({ id: n.id, title: 'v2', html: '<p>dos</p>', text: 'dos' });
  const dir = s._histPath(n.id);
  for (const f of fs.readdirSync(dir)) fs.renameSync(path.join(dir, f), path.join(dir, `${Number(f.slice(0, -5)) - 6 * 60e3}.json`));
  s.save({ id: n.id, title: 'v3', html: '<p>tres</p>', text: 'tres' });
  const versions = s.listVersions(n.id);
  assert.deepEqual(
    versions.map((v) => v.title),
    ['v2', 'v1'],
  );
  assert.equal(s.restoreVersion(n.id, versions[1].t).title, 'v1');
});

test('el historial se borra al bloquear la nota', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'a', html: '<p>a</p>', text: 'a' });
  s.save({ id: n.id, title: 'b', html: '<p>b</p>', text: 'b' });
  assert.equal(s.listVersions(n.id).length, 1);
  s.lockNote(n.id, 'pw');
  assert.equal(s.listVersions(n.id).length, 0);
});

test('importación: crea carpetas por ruta y notas con fechas', () => {
  const s = new Store(tmp());
  const folder = s.ensureFolderPath(['A', 'B']);
  const meta = s.createFull({ title: 'T', html: '<p>t</p>', text: 't', folderId: folder, created: 1000, updated: 2000 });
  assert.equal(meta.created, 1000);
  assert.equal(s.listFolders().filter((f) => f.parentId).length, 1);
});

test('cambiar contraseña: la vieja deja de abrir, la nueva sí, y nunca queda en claro', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'Secreto', html: '<p>clave</p>', text: 'clave' });
  s.lockNote(n.id, 'vieja');
  assert.ok(s.unlockNote(n.id, 'vieja'));
  const saltAntes = s._raw(n.id).lock.salt;
  assert.ok(s.changePassword(n.id, 'vieja', 'nueva'));
  const crudo = fs.readFileSync(s._notePath(n.id), 'utf8');
  assert.equal(crudo.includes('Secreto') || crudo.includes('clave'), false);
  assert.notEqual(s._raw(n.id).lock.salt, saltAntes, 'sal nueva');
  s.relock(n.id);
  assert.equal(s.unlockNote(n.id, 'vieja'), null);
  assert.equal(s.unlockNote(n.id, 'nueva').title, 'Secreto');
});

test('cambiar contraseña con la actual incorrecta no modifica nada', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'T', html: '<p>x</p>', text: 'x' });
  s.lockNote(n.id, 'pw');
  const antes = fs.readFileSync(s._notePath(n.id), 'utf8');
  assert.equal(s.changePassword(n.id, 'mala', 'otra'), null);
  assert.equal(s.changePassword(n.id, 'pw', ''), null);
  assert.equal(fs.readFileSync(s._notePath(n.id), 'utf8'), antes);
  assert.ok(s.unlockNote(n.id, 'pw'));
});

test('cambiar contraseña borra el historial cifrado con la clave anterior', () => {
  const s = new Store(tmp());
  const n = s.create();
  s.save({ id: n.id, title: 'a', html: '<p>a</p>', text: 'a' });
  s.lockNote(n.id, 'pw');
  s.unlockNote(n.id, 'pw');
  s.save({ id: n.id, title: 'b', html: '<p>b</p>', text: 'b' });
  s.save({ id: n.id, title: 'c', html: '<p>c</p>', text: 'c' });
  s.changePassword(n.id, 'pw', 'nuevo');
  assert.equal(s.listVersions(n.id).length, 0);
});

test('plantillas: guardar, listar, actualizar por nombre y borrar', () => {
  const dir = tmp();
  const s = new Store(dir);
  assert.deepEqual(s.listTemplates(), [], 'sin carpeta templates no hay plantillas');
  const a = s.saveTemplate({ name: ' Reunión ', html: '<h1>Reunión</h1><p>Asistentes</p>' });
  s.saveTemplate({ name: 'Diario', html: '<h1>Diario</h1>' });
  assert.deepEqual(
    s
      .listTemplates()
      .map((t) => t.name)
      .sort(),
    ['Diario', 'Reunión'],
  );
  const again = s.saveTemplate({ name: 'reunión', html: '<h1>Reunión v2</h1>' });
  assert.equal(again.id, a.id, 'mismo nombre actualiza, no duplica');
  assert.equal(s.listTemplates().length, 2);
  assert.equal(s.listTemplates().find((t) => t.id === a.id).html, '<h1>Reunión v2</h1>');
  assert.ok(fs.existsSync(path.join(dir, 'templates', `${a.id}.json`)), 'vive en la bóveda para sincronizarse');
  assert.equal(s.deleteTemplate(a.id), true);
  assert.equal(s.listTemplates().length, 1);
  assert.equal(s.deleteTemplate('../notes/x'), false, 'id inválido no toca nada');
});

test('plantillas: rechaza nombre vacío o contenido no válido y ignora archivos dañados', () => {
  const dir = tmp();
  const s = new Store(dir);
  assert.equal(s.saveTemplate({ name: '   ', html: '<p>x</p>' }), null);
  assert.equal(s.saveTemplate({ name: 'A', html: 5 }), null);
  s.saveTemplate({ name: 'Buena', html: '<p>ok</p>' });
  fs.writeFileSync(path.join(dir, 'templates', 'roto.json'), '{no es json');
  fs.writeFileSync(path.join(dir, 'templates', 'otro.json'), JSON.stringify({ id: 'otro', name: 7 }));
  assert.deepEqual(
    s.listTemplates().map((t) => t.name),
    ['Buena'],
  );
});

test('plantillas: una bóveda sin la carpeta templates sigue abriendo igual (compatible hacia atrás)', () => {
  const dir = tmp();
  const s = new Store(dir);
  const n = s.create();
  assert.ok(n.id);
  assert.equal(fs.existsSync(path.join(dir, 'templates')), false, 'no se crea hasta guardar una plantilla');
});
