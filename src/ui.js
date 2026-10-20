// Piezas de interfaz sueltas: menús contextuales, diálogos y avisos.
// Aquí «t» suele ser un parámetro (marca de tiempo), por eso la traducción se importa como «tr».
import { t as tr, locale } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
    if (it.sep) {
      m.append(document.createElement('hr'));
      continue;
    }
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
    b.addEventListener('click', () => {
      hideMenu();
      it.onClick?.();
    });
    m.append(b);
  }
  layer().append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  m.querySelector('button')?.focus();

  const onDown = (e) => {
    if (!m.contains(e.target)) hideMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      hideMenu();
      return;
    }
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

export function hideMenu() {
  closeMenu?.();
}

export function dialog(build) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'dialog-back';
    const box = document.createElement('form');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    back.append(box);
    const done = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) done(null);
    });
    build(box, done);
    document.body.append(back);
  });
}

const cancelBtn = () => `<button type="button" data-no>${esc(tr('ui.cancel'))}</button>`;

export function promptDialog({ title, value = '', placeholder = '', ok = tr('ui.accept') }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2><input type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(title)}">
      <div class="row">${cancelBtn()}<button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    const input = box.querySelector('input');
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      done(input.value.trim());
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => {
      input.focus();
      input.select();
    });
  });
}

export function confirmDialog({ title, text = '', ok = tr('ui.accept') }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(text)}</p>
      <div class="row">${cancelBtn()}<button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      done(true);
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(false));
    setTimeout(() => box.querySelector('.btn-primary').focus());
  }).then((v) => !!v);
}

/** Pide contraseña. Con confirm:true pide escribirla dos veces. Resuelve con el texto o null. */
export function passwordDialog({ title, text = '', confirm = false, ok = tr('ui.accept'), error = '' }) {
  return dialog((box, done) => {
    box.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p class="muted" style="margin:0 0 12px">${esc(text)}</p>` : ''}
      <input type="password" name="p1" placeholder="${esc(tr('pw.ph'))}" aria-label="${esc(tr('pw.ph'))}" autocomplete="off">
      ${confirm ? `<input type="password" name="p2" placeholder="${esc(tr('pw.repeat'))}" aria-label="${esc(tr('pw.repeat'))}" autocomplete="off" style="margin-top:8px">` : ''}
      <p class="form-error" role="alert">${esc(error)}</p>
      <div class="row">${cancelBtn()}<button type="submit" class="btn-primary">${esc(ok)}</button></div>`;
    const [a, b] = box.querySelectorAll('input');
    const err = box.querySelector('.form-error');
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!a.value) {
        err.textContent = tr('pw.empty');
        return;
      }
      if (confirm && a.value !== b.value) {
        err.textContent = tr('pw.mismatch');
        return;
      }
      done(a.value);
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => a.focus());
  });
}

/** Elegir plantilla. Resuelve con { use: plantilla }, { del: plantilla } (solo las propias) o null. */
export function templateDialog({ builtin, mine }) {
  return dialog((box, done) => {
    const all = [...builtin, ...mine];
    const row = (tpl, own) =>
      `<li class="tpl-row"><button type="button" class="tpl-use" data-use="${all.indexOf(tpl)}">${esc(tpl.name)}</button>${own ? `<button type="button" class="tpl-del" data-del="${all.indexOf(tpl)}" aria-label="${esc(tr('tpl.dlg.delete', { name: tpl.name }))}" title="${esc(tr('tpl.dlg.delete', { name: tpl.name }))}">×</button>` : ''}</li>`;
    box.innerHTML = `<h2>${esc(tr('tpl.dlg.title'))}</h2>
      <h3 class="tpl-h">${esc(tr('tpl.dlg.builtin'))}</h3><ul class="tpl-list">${builtin.map((x) => row(x, false)).join('')}</ul>
      <h3 class="tpl-h">${esc(tr('tpl.dlg.mine'))}</h3>${mine.length ? `<ul class="tpl-list">${mine.map((x) => row(x, true)).join('')}</ul>` : `<p class="muted" style="margin:0">${esc(tr('tpl.dlg.none'))}</p>`}
      <div class="row"><button type="button" data-no>${esc(tr('ui.cancel'))}</button></div>`;
    box.addEventListener('click', (e) => {
      const use = e.target.closest('[data-use]');
      const del = e.target.closest('[data-del]');
      if (use) done({ use: all[Number(use.dataset.use)] });
      else if (del) done({ del: all[Number(del.dataset.del)] });
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => box.querySelector('.tpl-use')?.focus());
  });
}

/** Cambio de contraseña: actual + nueva dos veces. Resuelve con { current, next } o null. */
export function changePasswordDialog() {
  return dialog((box, done) => {
    const field = (name, key, margin) =>
      `<input type="password" name="${name}" placeholder="${esc(tr(key))}" aria-label="${esc(tr(key))}" autocomplete="off"${margin ? ' style="margin-top:8px"' : ''}>`;
    box.innerHTML = `<h2>${esc(tr('lock.changeTitle'))}</h2><p class="muted" style="margin:0 0 12px">${esc(tr('lock.changeText'))}</p>
      ${field('cur', 'lock.currentPh')}${field('p1', 'lock.newPh', true)}${field('p2', 'pw.repeat', true)}
      <p class="form-error" role="alert"></p>
      <div class="row">${cancelBtn()}<button type="submit" class="btn-primary">${esc(tr('lock.changeOk'))}</button></div>`;
    const [cur, a, b] = box.querySelectorAll('input');
    const err = box.querySelector('.form-error');
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!cur.value || !a.value) {
        err.textContent = tr('pw.empty');
        return;
      }
      if (a.value !== b.value) {
        err.textContent = tr('pw.mismatch');
        return;
      }
      done({ current: cur.value, next: a.value });
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    setTimeout(() => cur.focus());
  });
}

/** Formulario de carpeta inteligente. Resuelve con { name, rules } o null. */
export function smartDialog({ folders, value }) {
  const r = value?.rules || {};
  const chk = (k) => `<label class="chk"><input type="checkbox" name="${k}" ${r[k] ? 'checked' : ''}> ${esc(tr(`smartdlg.${k}`))}</label>`;
  return dialog((box, done) => {
    box.classList.add('form');
    box.innerHTML = `<h2>${esc(value ? tr('smartdlg.editTitle') : tr('smartdlg.newTitle'))}</h2>
      <p class="muted" style="margin:0 0 12px">${esc(tr('smartdlg.intro'))}</p>
      <label class="fld">${esc(tr('smartdlg.name'))}<input type="text" name="name" value="${esc(value?.name || '')}" placeholder="${esc(tr('smartdlg.namePh'))}"></label>
      <div class="chk-grid">${['tasks', 'images', 'files', 'tables', 'pinned'].map(chk).join('')}</div>
      <label class="fld">${esc(tr('smartdlg.tags'))}<input type="text" name="tags" value="${esc((r.tags || []).join(' '))}" placeholder="${esc(tr('smartdlg.tagsPh'))}"></label>
      <label class="fld">${esc(tr('smartdlg.text'))}<input type="text" name="text" value="${esc(r.text || '')}"></label>
      <label class="fld">${esc(tr('smartdlg.query'))}<input type="text" name="query" value="${esc(r.query || '')}" placeholder="${esc(tr('smartdlg.queryPh'))}"></label>
      <label class="fld">${esc(tr('smartdlg.folder'))}
        <select name="folderId"><option value="">${esc(tr('smartdlg.anyFolder'))}</option>${folders.map((f) => `<option value="${esc(f.id)}" ${r.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      </label>
      <p class="form-error" role="alert"></p>
      <div class="row">${cancelBtn()}<button type="submit" class="btn-primary">${esc(value ? tr('common.save') : tr('folder.create'))}</button></div>`;
    const f = (n) => box.elements[n];
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const rules = {
        tasks: f('tasks').checked,
        images: f('images').checked,
        files: f('files').checked,
        tables: f('tables').checked,
        pinned: f('pinned').checked,
        tags: f('tags')
          .value.split(/[\s,#]+/)
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean),
        text: f('text').value.trim(),
        query: f('query').value.trim(),
        folderId: f('folderId').value,
      };
      const any = rules.tasks || rules.images || rules.files || rules.tables || rules.pinned || rules.tags.length || rules.text || rules.query || rules.folderId;
      if (!f('name').value.trim()) {
        box.querySelector('.form-error').textContent = tr('smartdlg.errName');
        return;
      }
      if (!any) {
        box.querySelector('.form-error').textContent = tr('smartdlg.errCond');
        return;
      }
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
    box.innerHTML = `<h2>${esc(tr('import.title'))}</h2>
      <p class="muted" style="margin:0 0 12px">${esc(tr('import.intro'))}</p>
      ${['folder', 'enex', 'files'].map((k) => `<button type="button" class="import-opt" data-k="${k}"><b>${esc(tr(`import.${k}.t`))}</b><span>${esc(tr(`import.${k}.d`))}</span></button>`).join('')}
      <div class="row">${cancelBtn()}</div>`;
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
    box.innerHTML = `<h2>${esc(tr('hist.title'))}</h2>
      <div class="hist-body">
        <div class="hist-list" role="listbox" aria-label="${esc(tr('hist.versions'))}"></div>
        <div class="hist-view"><div class="ProseMirror hist-doc" aria-live="polite"></div></div>
      </div>
      <div class="row"><button type="button" data-no>${esc(tr('hist.close'))}</button><button type="submit" class="btn-primary">${esc(tr('hist.restore'))}</button></div>`;
    const list = box.querySelector('.hist-list');
    const view = box.querySelector('.hist-doc');
    let cur = versions[0].t;
    const show = async (t) => {
      cur = t;
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.t) === t)));
      const v = await load(t);
      view.innerHTML = v?.html || `<p>${esc(tr('hist.empty'))}</p>`;
    };
    for (const v of versions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.t = v.t;
      b.setAttribute('role', 'option');
      b.innerHTML = `<b>${esc(fmt(v.t))}</b><span>${esc(v.title || tr('hist.untitled'))}</span><small>${esc(tr('hist.chars', { n: v.chars }))}</small>`;
      b.addEventListener('click', () => show(v.t));
      list.append(b);
    }
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      done(cur);
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    show(cur);
    setTimeout(() => list.querySelector('button').focus());
  });
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---- fechas: el idioma sale de la interfaz (se crean al usarlas, porque el idioma se fija al arrancar)
const DAY = 864e5;
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const formatters = new Map();
function fmt(opts) {
  const key = `${locale()}|${JSON.stringify(opts)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale(), opts));
  return formatters.get(key);
}

export function shortDate(t) {
  const diff = startOfDay(Date.now()) - startOfDay(t);
  if (diff <= 0) return fmt({ hour: '2-digit', minute: '2-digit' }).format(t);
  if (diff === DAY) return tr('date.yesterday');
  if (diff < 7 * DAY) return fmt({ weekday: 'long' }).format(t);
  return fmt({ day: '2-digit', month: '2-digit', year: '2-digit' }).format(t);
}
export const dayDate = (t) => fmt({ dateStyle: 'full' }).format(t);
export const longDate = (t) => fmt({ dateStyle: 'long', timeStyle: 'short' }).format(t);

export function groupLabel(t) {
  const diff = startOfDay(Date.now()) - startOfDay(t);
  if (diff <= 0) return tr('date.today');
  if (diff === DAY) return tr('date.yesterday');
  if (diff < 7 * DAY) return tr('date.last7');
  if (diff < 30 * DAY) return tr('date.last30');
  const d = new Date(t);
  const label = d.getFullYear() === new Date().getFullYear() ? fmt({ month: 'long' }).format(d) : fmt({ month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
