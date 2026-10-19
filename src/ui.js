// Piezas de interfaz sueltas: menús contextuales, diálogos y avisos.

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const layer = () => document.getElementById('menu-layer');
let closeMenu = null;

/** items: { label, onClick, danger?, checked?, header? } | { sep: true } */
export function showMenu(x, y, items) {
  hideMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  for (const it of items) {
    if (it.sep) { m.append(document.createElement('hr')); continue; }
    if (it.header) {
      const h = document.createElement('div');
      h.className = 'mh';
      h.textContent = it.header;
      m.append(h);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
    if (it.danger) b.className = 'danger';
    b.textContent = it.label;
    b.addEventListener('click', () => { hideMenu(); it.onClick?.(); });
    m.append(b);
  }
  layer().append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  m.querySelector('button')?.focus();

  const onDown = (e) => { if (!m.contains(e.target)) hideMenu(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { hideMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const bs = [...m.querySelectorAll('button')];
      const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', onDown, true));
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', hideMenu);
  closeMenu = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', hideMenu);
    m.remove();
    closeMenu = null;
  };
}

export function hideMenu() { closeMenu?.(); }

export function dialog(build) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'dialog-back';
    const box = document.createElement('form');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    back.append(box);
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) done(null); });
    build(box, done);
    document.body.append(back);
  });
}

export function promptDialog({ title, value = '', placeholder = '', ok = 'Aceptar' }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2><input type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(title)}">
      <div class="row"><button type="button" data-no>Cancelar</button><button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    const input = box.querySelector('input');
    box.addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => { input.focus(); input.select(); });
  });
}

export function confirmDialog({ title, text = '', ok = 'Aceptar' }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(text)}</p>
      <div class="row"><button type="button" data-no>Cancelar</button><button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    box.addEventListener('submit', (e) => { e.preventDefault(); done(true); });
    box.querySelector('[data-no]').addEventListener('click', () => done(false));
    setTimeout(() => box.querySelector('.btn-primary').focus());
  }).then((v) => !!v);
}

/** Pide contraseña. Con confirm:true pide escribirla dos veces. Resuelve con el texto o null. */
export function passwordDialog({ title, text = '', confirm = false, ok = 'Aceptar', error = '' }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p class="muted" style="margin:0 0 12px">${esc(text)}</p>` : ''}
      <input type="password" name="p1" placeholder="Contraseña" aria-label="Contraseña" autocomplete="off">
      ${confirm ? '<input type="password" name="p2" placeholder="Repite la contraseña" aria-label="Repite la contraseña" autocomplete="off" style="margin-top:8px">' : ''}
      <p class="form-error" role="alert">${esc(error)}</p>
      <div class="row"><button type="button" data-no>Cancelar</button><button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    const [a, b] = box.querySelectorAll('input');
    const err = box.querySelector('.form-error');
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!a.value) { err.textContent = 'Escribe una contraseña.'; return; }
      if (confirm && a.value !== b.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
      done(a.value);
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => a.focus());
  });
}

/** Formulario de carpeta inteligente. Resuelve con { name, rules } o null. */
export function smartDialog({ folders, value }) {
  const r = value?.rules || {};
  const chk = (k, label) => `<label class="chk"><input type="checkbox" name="${k}" ${r[k] ? 'checked' : ''}> ${label}</label>`;
  return dialog((box, done) => {
    box.classList.add('form');
    box.innerHTML = `<h2>${value ? 'Editar carpeta inteligente' : 'Carpeta inteligente nueva'}</h2>
      <p class="muted" style="margin:0 0 12px">Reúne por sí sola las notas que cumplan todo lo que marques.</p>
      <label class="fld">Nombre<input type="text" name="name" value="${esc(value?.name || '')}" placeholder="Por ejemplo: Pendientes con tareas"></label>
      <div class="chk-grid">
        ${chk('tasks', 'Tienen lista de tareas')}${chk('images', 'Tienen imágenes')}${chk('files', 'Tienen archivos adjuntos')}${chk('tables', 'Tienen tablas')}${chk('pinned', 'Están fijadas')}
      </div>
      <label class="fld">Etiquetas (separadas por espacio, sin #)<input type="text" name="tags" value="${esc((r.tags || []).join(' '))}" placeholder="ideas pendientes"></label>
      <label class="fld">Contienen el texto<input type="text" name="text" value="${esc(r.text || '')}"></label>
      <label class="fld">Búsqueda avanzada<input type="text" name="query" value="${esc(r.query || '')}" placeholder='tag:ideas tiene:imagen "frase exacta"'></label>
      <label class="fld">En la carpeta
        <select name="folderId"><option value="">Cualquiera</option>${folders.map((f) => `<option value="${esc(f.id)}" ${r.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      </label>
      <p class="form-error" role="alert"></p>
      <div class="row"><button type="button" data-no>Cancelar</button><button type="submit" class="btn-primary">${value ? 'Guardar' : 'Crear carpeta'}</button></div>`;
    const f = (n) => box.elements[n];
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const rules = {
        tasks: f('tasks').checked, images: f('images').checked, files: f('files').checked, tables: f('tables').checked, pinned: f('pinned').checked,
        tags: f('tags').value.split(/[\s,#]+/).map((t) => t.trim().toLowerCase()).filter(Boolean),
        text: f('text').value.trim(), query: f('query').value.trim(), folderId: f('folderId').value,
      };
      const any = rules.tasks || rules.images || rules.files || rules.tables || rules.pinned || rules.tags.length || rules.text || rules.query || rules.folderId;
      if (!f('name').value.trim()) { box.querySelector('.form-error').textContent = 'Ponle un nombre a la carpeta.'; return; }
      if (!any) { box.querySelector('.form-error').textContent = 'Marca al menos una condición.'; return; }
      done({ id: value?.id, name: f('name').value.trim(), rules });
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => f('name').focus());
  });
}

/** Elige de dónde importar. Resuelve con 'folder' | 'enex' | 'files' o null. */
export function importDialog() {
  return dialog((box, done) => {
    box.classList.add('form');
    box.innerHTML = `<h2>Importar notas</h2>
      <p class="muted" style="margin:0 0 12px">Las notas se agregan a Libreta; tus archivos originales no se tocan.</p>
      <button type="button" class="import-opt" data-k="folder"><b>Carpeta de notas</b><span>Markdown, texto o HTML con subcarpetas, imágenes y adjuntos. Sirve para Joplin, Obsidian, Bear y Notion, y para Apple Notes si antes la exportas con una herramienta de terceros (Apple Notes no exporta por sí sola).</span></button>
      <button type="button" class="import-opt" data-k="enex"><b>Evernote (.enex)</b><span>Exporta tus libretas desde Evernote y elige los archivos. Se conservan etiquetas, fechas, imágenes y adjuntos.</span></button>
      <button type="button" class="import-opt" data-k="files"><b>Archivos sueltos</b><span>Uno o varios archivos .md, .txt o .html.</span></button>
      <div class="row"><button type="button" data-no>Cancelar</button></div>`;
    box.querySelectorAll('.import-opt').forEach((b) => b.addEventListener('click', () => done(b.dataset.k)));
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => box.querySelector('.import-opt').focus());
  });
}

/**
 * Historial de versiones. versions: [{t,title,preview,chars}], load(t) -> {html}.
 * Resuelve con la marca de tiempo elegida para restaurar, o null.
 */
export function historyDialog({ versions, load, fmt }) {
  return dialog((box, done) => {
    box.classList.add('wide', 'hist');
    box.innerHTML = `<h2>Historial de versiones</h2>
      <div class="hist-body">
        <div class="hist-list" role="listbox" aria-label="Versiones"></div>
        <div class="hist-view"><div class="ProseMirror hist-doc" aria-live="polite"></div></div>
      </div>
      <div class="row"><button type="button" data-no>Cerrar</button><button type="submit" class="btn-primary">Restaurar esta versión</button></div>`;
    const list = box.querySelector('.hist-list');
    const view = box.querySelector('.hist-doc');
    let cur = versions[0].t;
    const show = async (t) => {
      cur = t;
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.t) === t)));
      const v = await load(t);
      view.innerHTML = v?.html || '<p>(vacía)</p>';
    };
    for (const v of versions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.t = v.t;
      b.setAttribute('role', 'option');
      b.innerHTML = `<b>${esc(fmt(v.t))}</b><span>${esc(v.title || 'Sin título')}</span><small>${v.chars} caracteres</small>`;
      b.addEventListener('click', () => show(v.t));
      list.append(b);
    }
    box.addEventListener('submit', (e) => { e.preventDefault(); done(cur); });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    show(cur);
    setTimeout(() => list.querySelector('button').focus());
  });
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- fechas en español
const DAY = 864e5;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmt = (opts) => new Intl.DateTimeFormat('es-MX', opts);
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const fWeekday = fmt({ weekday: 'long' });
const fShort = fmt({ day: '2-digit', month: '2-digit', year: '2-digit' });
const fLong = fmt({ dateStyle: 'long', timeStyle: 'short' });
const fMonth = fmt({ month: 'long' });
const fMonthYear = fmt({ month: 'long', year: 'numeric' });

export function shortDate(t) {
  const diff = startOfDay(Date.now()) - startOfDay(t);
  if (diff <= 0) return fTime.format(t);
  if (diff === DAY) return 'Ayer';
  if (diff < 7 * DAY) return fWeekday.format(t);
  return fShort.format(t);
}
export const longDate = (t) => fLong.format(t);

export function groupLabel(t) {
  const diff = startOfDay(Date.now()) - startOfDay(t);
  if (diff <= 0) return 'Hoy';
  if (diff === DAY) return 'Ayer';
  if (diff < 7 * DAY) return 'Últimos 7 días';
  if (diff < 30 * DAY) return 'Últimos 30 días';
  const d = new Date(t);
  const label = d.getFullYear() === new Date().getFullYear() ? fMonth.format(d) : fMonthYear.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
