import { t, tn, setLang, translateDom, locale } from './i18n.js';
import { $, esc, showMenu, promptDialog, confirmDialog, passwordDialog, changePasswordDialog, smartDialog, importDialog, historyDialog, toast, shortDate, longDate, groupLabel } from './ui.js';
import { search, matches } from './search.js';
import { helpDialog } from './help.js';
import { initUpdates } from './updates.js';
import { applyPrefs, settingsDialog } from './settings.js';

setLang(window.libreta.prefs.initial.lang);
applyPrefs(window.libreta.prefs.initial); // antes del primer dibujo, para que no parpadee
translateDom();
import { createEditor, snapshot, countWords, insertFiles } from './editor.js';
import { drawDialog, scanDialog } from './draw.js';
import { htmlToMarkdown } from './md.js';

const api = window.libreta;
const app = $('#app');
const store = {
  get: (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento */
    }
  },
};

const S = {
  folders: [],
  smart: [],
  collapsed: new Set(JSON.parse(store.get('collapsed', '[]'))),
  notes: [],
  snips: new Map(),
  scope: { type: 'all' }, // all | folder | smart | tag | trash
  view: store.get('view', 'list'),
  sort: store.get('sort', 'updated'),
  q: '',
  currentId: null,
  curUpdated: 0,
  dirty: false,
  loading: false,
};
let editor = null;
let saveTimer = null;

// ---------------------------------------------------------------- iconos
const ICON = {
  all: '<svg viewBox="0 0 20 20"><path d="M5 3.5h7l3 3v10H5z M12 3.5v3h3 M7.5 10h5M7.5 13h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  folder:
    '<svg viewBox="0 0 20 20"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3.4l1.6 1.8h6A1.5 1.5 0 0 1 17 8.3v6.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  tag: '<svg viewBox="0 0 20 20"><path d="M8 3.5 5 16.5M14 3.5l-3 13M3.5 7.5h13M3 12.5h13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>',
  trash: '<svg viewBox="0 0 20 20"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  smart:
    '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 6.5v7M6.5 10h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>',
  chevron: '<svg viewBox="0 0 12 12"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg class="lk" viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="7.5" rx="1.8" fill="currentColor"/><path d="M7 9V6.8a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  pin: '<svg class="pin" viewBox="0 0 20 20"><path d="M7 3.5h6l-.8 4 2.3 3H5.5l2.3-3zM10 10.5V17" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};

// ---------------------------------------------------------------- datos
const live = () => S.notes.filter((n) => !n.deletedAt);
const noteById = (id) => S.notes.find((n) => n.id === id);
const folderName = (id) => S.folders.find((f) => f.id === id)?.name ?? '';
const childrenOf = (pid) => S.folders.filter((f) => (f.parentId || null) === pid);
const folderWithDescendants = (id) => {
  const out = [id];
  for (const c of childrenOf(id)) out.push(...folderWithDescendants(c.id));
  return out;
};
const folderPath = (id) => {
  const parts = [];
  for (let f = S.folders.find((x) => x.id === id); f; f = S.folders.find((x) => x.id === f.parentId)) parts.unshift(f.name);
  return parts.join(' › ');
};
const smartById = (id) => S.smart.find((x) => x.id === id);
const searchCtx = { folderPath: (id) => folderPath(id) };

function matchesSmart(n, r) {
  if (n.locked) return false; // su contenido está cifrado: no se puede evaluar
  const f = n.flags || {};
  if ((r.tasks && !f.tasks) || (r.images && !f.images) || (r.files && !f.files) || (r.tables && !f.tables) || (r.pinned && !n.pinned)) return false;
  if (r.tags?.length && !r.tags.every((t) => n.tags?.includes(t))) return false;
  if (r.folderId && !folderWithDescendants(r.folderId).includes(n.folderId)) return false;
  if (r.text && !`${n.title}\n${n.text}`.toLowerCase().includes(r.text.toLowerCase())) return false;
  if (r.query && !matches(n, r.query, searchCtx)) return false;
  return true;
}

function visibleNotes() {
  const q = S.q.trim();
  S.snips = new Map();
  if (q) {
    const pool = S.scope.type === 'trash' ? S.notes.filter((n) => n.deletedAt) : live();
    const hits = search(pool, q, searchCtx);
    for (const h of hits) S.snips.set(h.note.id, h.snippet);
    return hits.map((h) => h.note);
  }
  let list;
  if (S.scope.type === 'trash') list = S.notes.filter((n) => n.deletedAt);
  else if (S.scope.type === 'folder') {
    const ids = folderWithDescendants(S.scope.id);
    list = live().filter((n) => ids.includes(n.folderId));
  } else if (S.scope.type === 'smart') {
    const sf = smartById(S.scope.id);
    list = sf ? live().filter((n) => matchesSmart(n, sf.rules)) : [];
  } else if (S.scope.type === 'tag') list = live().filter((n) => n.tags?.includes(S.scope.id));
  else list = live();
  const key = S.sort === 'created' ? 'created' : 'updated';
  const cmp = S.sort === 'title' ? (a, b) => (a.title || '~').localeCompare(b.title || '~', locale(), { sensitivity: 'base' }) : (a, b) => b[key] - a[key];
  return list.sort((a, b) => (S.scope.type === 'trash' ? 0 : b.pinned - a.pinned) || cmp(a, b));
}

async function reload() {
  [S.folders, S.notes, S.smart] = await Promise.all([api.folders.list(), api.notes.list(), api.smart.list()]);
  renderAll();
}

// ---------------------------------------------------------------- barra lateral
function renderSide() {
  const scopeIds = (f) => folderWithDescendants(f.id);
  const item = (attrs, icon, name, ct, current, depth = 0, twist = '') =>
    `<button type="button" class="nav-item" style="--depth:${depth}" ${attrs} ${current ? 'aria-current="true"' : ''}>${twist}${icon}<span class="nm">${esc(name)}</span><span class="ct">${ct}</span></button>`;
  const sc = S.scope;
  $('#nav-main').innerHTML = item('data-scope="all"', ICON.all, t('side.allNotes'), live().length, sc.type === 'all', 0, '<span class="twist none"></span>');

  $('#smart-block').hidden = !S.smart.length;
  $('#nav-smart').innerHTML = S.smart
    .map((sf) =>
      item(
        `data-scope="smart" data-id="${esc(sf.id)}"`,
        ICON.smart,
        sf.name,
        live().filter((n) => matchesSmart(n, sf.rules)).length,
        sc.type === 'smart' && sc.id === sf.id,
        0,
        '<span class="twist none"></span>',
      ),
    )
    .join('');

  const tree = (pid, depth) =>
    childrenOf(pid)
      .map((f) => {
        const kids = childrenOf(f.id);
        const open = !S.collapsed.has(f.id);
        const ids = scopeIds(f);
        const twist = kids.length
          ? `<span class="twist" role="button" tabindex="-1" data-twist="${esc(f.id)}" aria-expanded="${open}" aria-label="${open ? t('side.collapse') : t('side.expand')} ${esc(f.name)}">${ICON.chevron}</span>`
          : '<span class="twist none"></span>';
        return (
          item(`data-scope="folder" data-id="${esc(f.id)}"`, ICON.folder, f.name, live().filter((n) => ids.includes(n.folderId)).length, sc.type === 'folder' && sc.id === f.id, depth, twist) +
          (kids.length && open ? tree(f.id, depth + 1) : '')
        );
      })
      .join('');
  $('#nav-folders').innerHTML =
    tree(null, 0) + item('data-scope="trash"', ICON.trash, t('side.trash'), S.notes.filter((n) => n.deletedAt).length || '', sc.type === 'trash', 0, '<span class="twist none"></span>');

  const tags = new Map();
  for (const n of live()) for (const t of n.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  $('#tags-block').hidden = !tags.size;
  $('#nav-tags').innerHTML = [...tags]
    .sort((a, b) => a[0].localeCompare(b[0], locale()))
    .map(([t, c]) => item(`data-scope="tag" data-id="${esc(t)}"`, ICON.tag, t, c, sc.type === 'tag' && sc.id === t, 0, '<span class="twist none"></span>'))
    .join('');
}

function setScope(scope) {
  S.scope = scope;
  S.q = '';
  $('#search').value = '';
  renderAll();
  app.dataset.pane = 'list';
}

$('.sidebar').addEventListener('click', (e) => {
  const tw = e.target.closest('[data-twist]');
  if (tw) {
    const id = tw.dataset.twist;
    if (S.collapsed.has(id)) S.collapsed.delete(id);
    else S.collapsed.add(id);
    store.set('collapsed', JSON.stringify([...S.collapsed]));
    renderSide();
    return;
  }
  const b = e.target.closest('[data-scope]');
  if (!b) return;
  setScope({ type: b.dataset.scope, id: b.dataset.id });
});

$('.sidebar').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-scope="folder"], [data-scope="smart"]');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.scope === 'smart') {
    const sf = smartById(b.dataset.id);
    showMenu(e.clientX, e.clientY, [{ label: t('smart.editRules'), onClick: () => editSmart(sf) }, { sep: true }, { label: t('smart.delete'), danger: true, onClick: () => deleteSmart(sf) }]);
    return;
  }
  const f = S.folders.find((x) => x.id === b.dataset.id);
  showMenu(e.clientX, e.clientY, [
    { label: t('folder.menu.newNoteHere'), onClick: () => newNote(f.id) },
    { label: t('folder.menu.newSub'), onClick: () => newFolder(f.id) },
    { label: t('folder.menu.rename'), onClick: () => renameFolder(f) },
    { label: t('folder.menu.move'), onClick: () => folderMoveMenu(e.clientX, e.clientY, f) },
    { sep: true },
    { label: t('folder.menu.delete'), danger: true, onClick: () => deleteFolder(f) },
  ]);
});

function folderMoveMenu(x, y, f) {
  const banned = new Set(folderWithDescendants(f.id));
  const move = async (pid) => {
    S.folders = await api.folders.move(f.id, pid);
    renderAll();
  };
  showMenu(x, y, [
    { header: t('folder.moveHeader', { name: f.name }) },
    { label: t('folder.topLevel'), checked: !f.parentId, onClick: () => move(null) },
    ...S.folders.filter((o) => !banned.has(o.id)).map((o) => ({ label: folderPath(o.id), checked: f.parentId === o.id, onClick: () => move(o.id) })),
  ]);
}

// arrastrar una nota a una carpeta
$('.sidebar').addEventListener('dragover', (e) => {
  const b = e.target.closest('[data-scope="folder"]');
  document.querySelectorAll('.nav-item.drop').forEach((x) => x !== b && x.classList.remove('drop'));
  if (b && e.dataTransfer.types.includes('text/x-libreta-note')) {
    e.preventDefault();
    b.classList.add('drop');
  }
});
$('.sidebar').addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) document.querySelectorAll('.nav-item.drop').forEach((x) => x.classList.remove('drop'));
});
$('.sidebar').addEventListener('drop', async (e) => {
  document.querySelectorAll('.nav-item.drop').forEach((x) => x.classList.remove('drop'));
  const b = e.target.closest('[data-scope="folder"]');
  const id = e.dataTransfer.getData('text/x-libreta-note');
  if (!b || !id) return;
  e.preventDefault();
  await moveNote(id, b.dataset.id);
});

async function newFolder(parentId = null) {
  const name = await promptDialog({ title: parentId ? t('folder.subOf', { name: folderName(parentId) }) : t('folder.newTitle'), placeholder: t('folder.namePh'), ok: t('folder.create') });
  if (!name) return;
  const f = await api.folders.create(name, parentId);
  S.folders.push(f);
  if (parentId) {
    S.collapsed.delete(parentId);
    store.set('collapsed', JSON.stringify([...S.collapsed]));
  }
  setScope({ type: 'folder', id: f.id });
}

async function editSmart(sf) {
  const r = await smartDialog({ folders: S.folders.map((f) => ({ id: f.id, name: folderPath(f.id) })), value: sf });
  if (!r) return;
  S.smart = await api.smart.save(r);
  setScope({ type: 'smart', id: sf ? sf.id : S.smart[S.smart.length - 1].id });
}
async function deleteSmart(sf) {
  const ok = await confirmDialog({ title: t('folder.deleteTitle', { name: sf.name }), text: t('smart.deleteText'), ok: t('common.delete') });
  if (!ok) return;
  S.smart = await api.smart.remove(sf.id);
  if (S.scope.type === 'smart' && S.scope.id === sf.id) S.scope = { type: 'all' };
  renderAll();
}
async function renameFolder(f) {
  const name = await promptDialog({ title: t('folder.renameTitle'), value: f.name, ok: t('common.save') });
  if (!name) return;
  S.folders = await api.folders.rename(f.id, name);
  renderAll();
}
async function deleteFolder(f) {
  const ids = folderWithDescendants(f.id);
  if (S.folders.length - ids.length < 1) {
    toast(t('folder.mustKeepOne'));
    return;
  }
  const n = live().filter((x) => ids.includes(x.folderId)).length;
  const ok = await confirmDialog({
    title: t('folder.deleteTitle', { name: f.name }),
    text: n ? tn('folder.deleteNotes', n) : t('folder.empty'),
    ok: t('folder.deleteOk'),
  });
  if (!ok) return;
  await flushSave();
  await api.folders.remove(f.id);
  if (S.scope.type === 'folder' && ids.includes(S.scope.id)) S.scope = { type: 'all' };
  await reload();
  if (S.currentId && noteById(S.currentId)?.deletedAt) await openNote(S.currentId);
}
$('#btn-new-folder').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const cur = S.scope.type === 'folder' ? S.folders.find((f) => f.id === S.scope.id) : null;
  showMenu(r.left, r.top - 200, [
    { label: t('folder.newMenu'), onClick: () => newFolder() },
    ...(cur ? [{ label: t('folder.subOfMenu', { name: cur.name }), onClick: () => newFolder(cur.id) }] : []),
    { label: t('folder.smartMenu'), onClick: () => editSmart(null) },
    { sep: true },
    { label: t('folder.importMenu'), onClick: importNotes },
  ]);
});

// ---------------------------------------------------------------- lista
const scopeTitle = () => {
  if (S.q.trim() && S.scope.type !== 'trash') return t('list.results');
  const { type, id } = S.scope;
  if (type === 'folder') return folderName(id);
  if (type === 'tag') return `#${id}`;
  if (type === 'smart') return smartById(id)?.name ?? t('list.smartDefault');
  if (type === 'trash') return t('side.trash');
  return t('side.allNotes');
};

function renderList() {
  const notes = visibleNotes();
  $('#list-name').textContent = scopeTitle();
  $('#list-count').textContent = notes.length ? tn('list.count', notes.length) : '';
  $('#v-list').setAttribute('aria-pressed', String(S.view === 'list'));
  $('#v-gallery').setAttribute('aria-pressed', String(S.view === 'gallery'));
  $('#btn-new').hidden = S.scope.type === 'trash';
  const el = $('#list');
  el.dataset.view = S.view;

  let html = '';
  if (S.scope.type === 'trash' && notes.length) {
    html += `<div class="trash-tools"><span>${esc(t('list.trashHint'))}</span><button type="button" id="btn-empty-trash">${esc(t('list.emptyTrash'))}</button></div>`;
  }
  if (S.q.trim() && notes.length) {
    html += `<div class="trash-tools"><span>${esc(t('list.byRelevance'))}</span><button type="button" class="btn-soft" id="btn-save-search">${esc(t('list.saveSearch'))}</button></div>`;
  }
  if (!notes.length) {
    const msg = S.q.trim()
      ? [t('empty.noResults.t'), t('empty.noResults.d', { q: S.q.trim() })]
      : S.scope.type === 'trash'
        ? [t('empty.trash.t'), t('empty.trash.d')]
        : S.scope.type === 'smart'
          ? [t('empty.smart.t'), t('empty.smart.d')]
          : S.scope.type === 'tag'
            ? [t('empty.tag.t'), t('empty.tag.d', { tag: S.scope.id })]
            : [t('empty.none.t'), t('empty.none.d')];
    const help = S.q.trim() ? `<span class="search-help">${esc(t('search.helpLead'))} ${[1, 2, 3, 4, 5].map((i) => `<code>${esc(t(`search.ex${i}`))}</code>`).join(' ')}</span>` : '';
    el.innerHTML = `${html}<div class="empty-list"><strong>${esc(msg[0])}</strong>${esc(msg[1])}${help}</div>`;
    return;
  }

  const showFolder = S.scope.type !== 'folder';
  const groups = [];
  for (const n of notes) {
    const g = S.q.trim()
      ? t('group.matches')
      : S.scope.type === 'trash'
        ? t('group.deleted')
        : n.pinned
          ? t('group.pinned')
          : S.sort === 'title'
            ? t('group.notes')
            : groupLabel(S.sort === 'created' ? n.created : n.updated);
    const last = groups[groups.length - 1];
    if (last?.name === g) last.items.push(n);
    else groups.push({ name: g, items: [n] });
  }
  const when = (n) => (S.scope.type === 'trash' ? n.deletedAt : S.sort === 'created' ? n.created : n.updated);
  for (const g of groups) {
    html += `<div class="grp">${esc(g.name)}</div>`;
    if (S.view === 'gallery') {
      html +=
        '<div class="cards">' +
        g.items
          .map(
            (n) => `
        <button type="button" class="card" draggable="true" data-id="${n.id}" ${n.id === S.currentId ? 'aria-current="true"' : ''}>
          <div class="card-body ${n.thumb ? 'has-img' : ''}">
            ${
              n.locked
                ? `<div class="card-t">${ICON.lock}${esc(t('note.locked'))}</div><div class="card-p">${esc(t('note.lockedDesc'))}</div>`
                : n.thumb
                  ? `<img src="${esc(n.thumb)}" alt="" loading="lazy">`
                  : `<div class="card-t">${esc(n.title || t('note.newDefault'))}</div><div class="card-p">${esc(n.preview)}</div>`
            }
          </div>
          <div class="card-foot">${n.thumb && !n.locked ? `<b>${esc(n.title || t('note.newDefault'))}</b>` : ''}${n.pinned ? ICON.pin : ''}${esc(shortDate(when(n)))}</div>
        </button>`,
          )
          .join('') +
        '</div>';
    } else {
      html += g.items
        .map(
          (n) => `
        <button type="button" class="note" draggable="true" data-id="${n.id}" ${n.id === S.currentId ? 'aria-current="true"' : ''}>
          <div class="note-t">${n.pinned ? ICON.pin : ''}${n.locked ? ICON.lock : ''}${esc(n.locked ? t('note.locked') : n.title || t('note.newDefault'))}</div>
          <div class="note-m"><span class="d">${esc(shortDate(when(n)))}</span><span class="p">${esc(n.locked ? t('note.protected') : S.snips.get(n.id) || n.preview || t('note.noExtra'))}</span></div>
          ${showFolder ? `<div class="note-f">${esc(folderName(n.folderId))}</div>` : ''}
        </button>`,
        )
        .join('');
    }
  }
  el.innerHTML = html;
}

const listEl = $('#list');
listEl.addEventListener('click', (e) => {
  if (e.target.closest('#btn-empty-trash')) {
    emptyTrash();
    return;
  }
  if (e.target.closest('#btn-save-search')) {
    saveSearch();
    return;
  }
  const b = e.target.closest('[data-id]');
  if (b) openNote(b.dataset.id);
});
listEl.addEventListener('dragstart', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  e.dataTransfer.setData('text/x-libreta-note', b.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
});
listEl.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  e.preventDefault();
  noteMenu(e.clientX, e.clientY, b.dataset.id);
});
listEl.addEventListener('keydown', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const all = [...listEl.querySelectorAll('[data-id]')];
    const next = all[all.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      next.focus();
      openNote(next.dataset.id, { keepFocus: true });
    }
  } else if (e.key === 'Delete') {
    const n = noteById(b.dataset.id);
    if (n && !n.deletedAt) trashNote(n.id);
  }
});

function noteMenu(x, y, id) {
  const n = noteById(id);
  if (!n) return;
  if (n.deletedAt) {
    showMenu(x, y, [
      { label: t('note.menu.restore'), onClick: () => restoreNote(id) },
      { label: t('note.menu.purge'), danger: true, onClick: () => purgeNote(id) },
    ]);
    return;
  }
  showMenu(x, y, [
    { label: n.pinned ? t('note.menu.unpin') : t('note.menu.pin'), onClick: () => togglePin(id) },
    { sep: true },
    { header: t('note.menu.moveTo') },
    ...S.folders.map((f) => ({ label: folderPath(f.id), checked: f.id === n.folderId, onClick: () => moveNote(id, f.id) })),
    { sep: true },
    { label: t('note.menu.trash'), danger: true, onClick: () => trashNote(id) },
  ]);
}

$('#btn-sort').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const set = (v) => () => {
    S.sort = v;
    store.set('sort', v);
    renderList();
  };
  showMenu(r.left, r.bottom + 4, [
    { header: t('sort.header') },
    { label: t('sort.updated'), checked: S.sort === 'updated', onClick: set('updated') },
    { label: t('sort.created'), checked: S.sort === 'created', onClick: set('created') },
    { label: t('sort.title'), checked: S.sort === 'title', onClick: set('title') },
  ]);
});
const setView = (v) => {
  S.view = v;
  store.set('view', v);
  renderList();
};
$('#v-list').addEventListener('click', () => setView('list'));
$('#v-gallery').addEventListener('click', () => setView('gallery'));

let searchTimer;
$('#search').addEventListener('input', (e) => {
  S.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderList, 90);
});

async function saveSearch() {
  const q = S.q.trim();
  const name = await promptDialog({ title: t('search.saveTitle'), value: q.length > 40 ? q.slice(0, 40) : q, placeholder: t('search.saveName'), ok: t('common.save') });
  if (!name) return;
  S.smart = await api.smart.save({ name, rules: { query: q } });
  setScope({ type: 'smart', id: S.smart[S.smart.length - 1].id });
  toast(t('toast.searchSaved'));
}
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    S.q = '';
    renderList();
  }
});

// ---------------------------------------------------------------- acciones sobre notas
async function newNote(folderId) {
  await flushSave();
  const target = folderId || (S.scope.type === 'folder' ? S.scope.id : undefined);
  const n = await api.notes.create(target);
  const { html, ...meta } = n;
  S.notes.push(meta);
  if (S.scope.type === 'trash' || S.scope.type === 'tag' || S.scope.type === 'smart' || (S.scope.type === 'folder' && S.scope.id !== meta.folderId)) S.scope = { type: 'folder', id: meta.folderId };
  S.q = '';
  $('#search').value = '';
  renderAll();
  await openNote(n.id, { focus: true });
}

async function togglePin(id) {
  const n = noteById(id);
  if (!n) return;
  const meta = await api.notes.setMeta(id, { pinned: !n.pinned });
  Object.assign(n, meta);
  renderList();
  syncToolbar();
}

async function moveNote(id, folderId) {
  const n = noteById(id);
  if (!n || n.folderId === folderId) return;
  await flushSave();
  Object.assign(n, await api.notes.setMeta(id, { folderId }));
  renderAll();
  toast(t('toast.moved', { name: folderName(folderId) }));
}

async function trashNote(id) {
  if (id === S.currentId) await flushSave();
  await api.notes.trash(id);
  const n = noteById(id);
  if (n) n.deletedAt = Date.now();
  const list = visibleNotes();
  renderAll();
  toast(t('toast.trashed'));
  if (id === S.currentId) {
    if (list[0]) await openNote(list[0].id);
    else closeNote();
  }
}

async function restoreNote(id) {
  await api.notes.restore(id);
  await reload();
  if (id === S.currentId) await openNote(id);
  toast(t('toast.restored'));
}

async function purgeNote(id) {
  const ok = await confirmDialog({ title: t('purge.title'), text: t('purge.text'), ok: t('purge.ok') });
  if (!ok) return;
  await api.notes.purge(id);
  S.notes = S.notes.filter((n) => n.id !== id);
  if (id === S.currentId) closeNote();
  renderAll();
}

async function emptyTrash() {
  const ok = await confirmDialog({ title: t('trash.emptyTitle'), text: t('trash.emptyText'), ok: t('list.emptyTrash') });
  if (!ok) return;
  await api.notes.emptyTrash();
  S.notes = live();
  if (S.currentId && !noteById(S.currentId)) closeNote();
  renderAll();
}

// ---------------------------------------------------------------- editor
async function openNote(id, { focus = false, keepFocus = false } = {}) {
  if (id !== S.currentId) {
    await flushSave();
    if (S.currentId && noteById(S.currentId)?.locked) api.notes.relock(S.currentId);
  }
  const n = await api.notes.get(id);
  if (!n) {
    await reload();
    toast(t('toast.noteGone'));
    return;
  }
  S.currentId = id;
  S.curUpdated = n.updated;
  S.dirty = false;
  if (n.locked && n.html === null) showLock(keepFocus);
  else showNote(n, { focus, keepFocus });
  for (const el of listEl.querySelectorAll('[aria-current]')) el.removeAttribute('aria-current');
  listEl.querySelector(`[data-id="${CSS.escape(id)}"]`)?.setAttribute('aria-current', 'true');
}

function showNote(n, { focus = false, keepFocus = false } = {}) {
  S.loading = true;
  $('#editor-empty').hidden = true;
  $('#lock-screen').hidden = true;
  $('#editor-wrap').hidden = false;
  editor.setEditable(!n.deletedAt);
  editor.commands.setContent(n.html || '', { emitUpdate: false });
  S.loading = false;
  $('#doc-date').textContent = longDate(n.updated);
  $('#trash-bar').hidden = !n.deletedAt;
  $('#toolbar')
    .querySelectorAll('button, select')
    .forEach((b) => {
      if (!b.classList.contains('only-narrow')) b.disabled = !!n.deletedAt;
    });
  updateStatus('');
  syncToolbar();
  $('#doc-scroll').scrollTop = 0;
  if (!keepFocus) app.dataset.pane = 'editor';
  if (focus && !n.deletedAt) editor.commands.focus('start');
  renderBacklinks();
}

// ---- notas bloqueadas
function showLock(keepFocus) {
  S.loading = true;
  editor.commands.setContent('', { emitUpdate: false }); // que no quede texto en pantalla
  S.loading = false;
  $('#editor-empty').hidden = true;
  $('#editor-wrap').hidden = true;
  $('#backlinks').hidden = true;
  $('#lock-screen').hidden = false;
  $('#lock-pass').value = '';
  $('#lock-error').textContent = '';
  if (!keepFocus) {
    app.dataset.pane = 'editor';
    $('#lock-pass').focus();
  }
}

$('#lock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = S.currentId;
  const n = await api.notes.unlock(id, $('#lock-pass').value);
  if (!n) {
    $('#lock-error').textContent = t('lock.wrong');
    $('#lock-pass').select();
    return;
  }
  S.curUpdated = n.updated;
  showNote(n, {});
  editor.commands.focus('end');
});

async function lockCurrent() {
  const id = S.currentId;
  const pwd = await passwordDialog({
    title: t('lock.title'),
    confirm: true,
    ok: t('lock.ok'),
    text: t('lock.warn'),
  });
  if (!pwd) {
    editor.commands.focus();
    return;
  }
  await flushSave();
  const meta = await api.notes.lock(id, pwd);
  if (!meta) {
    toast(t('toast.lockFailed'));
    return;
  }
  Object.assign(noteById(id), meta);
  renderAll();
  await openNote(id);
  toast(t('toast.locked'));
}

async function removeLockCurrent() {
  const id = S.currentId;
  const pwd = await passwordDialog({ title: t('lock.removeTitle'), text: t('lock.removeText'), ok: t('lock.removeOk') });
  if (!pwd) return;
  await flushSave();
  const meta = await api.notes.removeLock(id, pwd);
  if (!meta) {
    toast(t('lock.wrong'));
    return;
  }
  Object.assign(noteById(id), meta, { locked: false });
  S.notes = await api.notes.list();
  renderAll();
  syncToolbar();
  toast(t('toast.lockRemoved'));
}

async function changePasswordCurrent() {
  const id = S.currentId;
  const r = await changePasswordDialog();
  if (!r) return;
  await flushSave();
  const meta = await api.notes.changePassword(id, r.current, r.next);
  if (!meta) {
    toast(t('lock.wrong'));
    return;
  }
  Object.assign(noteById(id), meta);
  S.curUpdated = meta.updated;
  toast(t('toast.passwordChanged'));
}

$('#tb-lock').addEventListener('click', (e) => {
  const n = noteById(S.currentId);
  if (!n) return;
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(
    r.right - 190,
    r.bottom + 4,
    n.locked
      ? [
          {
            label: t('lock.menu.now'),
            onClick: async () => {
              await flushSave();
              api.notes.relock(n.id);
              await openNote(n.id);
            },
          },
          { label: t('lock.menu.change'), onClick: changePasswordCurrent },
          { label: t('lock.menu.remove'), onClick: removeLockCurrent },
        ]
      : [{ label: t('lock.menu.set'), onClick: lockCurrent }],
  );
});

function closeNote() {
  S.currentId = null;
  $('#lock-screen').hidden = true;
  $('#editor-wrap').hidden = true;
  $('#editor-empty').hidden = false;
  app.dataset.pane = 'list';
}

function updateStatus(saveText) {
  const words = countWords(editor.getText());
  $('#statusbar').innerHTML = `<span>${tn('status.words', words)}</span><span>${esc(saveText)}</span>`;
}

function onEditorUpdate() {
  if (S.loading || !S.currentId) return;
  S.dirty = true;
  updateStatus(t('status.unsaved'));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (!S.dirty || !S.currentId) return;
  S.dirty = false;
  const id = S.currentId;
  const snap = snapshot(editor);
  const meta = await api.notes.save({ id, ...snap });
  if (!meta) return;
  const n = noteById(id);
  if (n) Object.assign(n, meta, meta.locked ? {} : { text: snap.text });
  if (id === S.currentId) {
    S.curUpdated = meta.updated;
    $('#doc-date').textContent = longDate(meta.updated);
    updateStatus(t('status.saved'));
  }
  renderSide();
  renderList();
}

// ---------------------------------------------------------------- barra de formato
const TB = {
  bold: [() => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold')],
  italic: [() => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic')],
  underline: [() => editor.chain().focus().toggleUnderline().run(), () => editor.isActive('underline')],
  strike: [() => editor.chain().focus().toggleStrike().run(), () => editor.isActive('strike')],
  highlight: [() => editor.chain().focus().toggleHighlight().run(), () => editor.isActive('highlight')],
  task: [() => editor.chain().focus().toggleTaskList().run(), () => editor.isActive('taskList')],
  bullet: [() => editor.chain().focus().toggleBulletList().run(), () => editor.isActive('bulletList')],
  ordered: [() => editor.chain().focus().toggleOrderedList().run(), () => editor.isActive('orderedList')],
  quote: [() => editor.chain().focus().toggleBlockquote().run(), () => editor.isActive('blockquote')],
  table: [() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), () => editor.isActive('table')],
  link: [() => editLink(), () => editor.isActive('link')],
  image: [() => pickFiles('image/*'), () => false],
  file: [() => pickFiles(''), () => false],
  draw: [() => doDraw(), () => false],
  scan: [() => doScan(), () => false],
};

$('#toolbar').addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) e.preventDefault();
});
$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (b) TB[b.dataset.cmd][0]();
});
$('#tb-style').addEventListener('change', (e) => {
  const v = e.target.value;
  const c = editor.chain().focus();
  if (v === 'p') c.setParagraph().run();
  else if (v === 'code') c.toggleCodeBlock().run();
  else c.setHeading({ level: Number(v[1]) }).run();
});

function syncToolbar() {
  if (!editor) return;
  for (const b of $('#toolbar').querySelectorAll('[data-cmd]')) b.setAttribute('aria-pressed', String(!!TB[b.dataset.cmd][1]()));
  const style = editor.isActive('codeBlock') ? 'code' : [1, 2, 3].map((l) => editor.isActive('heading', { level: l }) && `h${l}`).find(Boolean) || 'p';
  $('#tb-style').value = style;
  const n = noteById(S.currentId);
  $('#tb-lock').setAttribute('aria-pressed', String(!!n?.locked));
  $('#tb-lock').title = n?.locked ? t('tb.lockOptions') : t('tb.lock');
  $('#tb-pin').setAttribute('aria-pressed', String(!!n?.pinned));
  $('#tb-pin').title = n?.pinned ? t('note.menu.unpin') : t('note.menu.pin');
}

async function editLink() {
  const prev = editor.getAttributes('link').href || '';
  const url = await promptDialog({ title: t('link.title'), value: prev, placeholder: 'https://…', ok: t('link.apply') });
  if (url === null) {
    editor.commands.focus();
    return;
  }
  if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
  else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

function pickFiles(accept) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.multiple = true;
  input.addEventListener('change', () => insertFiles(editor, [...input.files]));
  input.click();
}
async function doDraw() {
  const f = await drawDialog();
  if (f) await insertFiles(editor, [f]);
  else editor.commands.focus();
}
async function doScan() {
  await scanDialog((f) => insertFiles(editor, [f], undefined, { focus: false }));
  editor.commands.focus();
}

$('#tb-pin').addEventListener('click', () => S.currentId && togglePin(S.currentId));
$('#tb-menu').addEventListener('click', (e) => {
  const id = S.currentId;
  const n = noteById(id);
  if (!n) return;
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(r.right - 210, r.bottom + 4, [
    { header: t('note.menu.moveTo') },
    ...S.folders.map((f) => ({ label: folderPath(f.id), checked: f.id === n.folderId, onClick: () => moveNote(id, f.id) })),
    { sep: true },
    { label: t('menu.history'), onClick: openHistory },
    { sep: true },
    { header: t('share.header') },
    { label: t('share.text'), onClick: () => shareNote('text') },
    { label: t('share.md'), onClick: () => shareNote('md-copy') },
    { label: t('share.mail'), onClick: () => shareNote('mail') },
    { sep: true },
    { header: t('export.header') },
    { label: t('export.pdf'), onClick: () => exportNote('pdf') },
    { label: t('export.html'), onClick: () => exportNote('html') },
    { label: t('export.md'), onClick: () => exportNote('md') },
    { sep: true },
    { label: t('note.menu.trash'), danger: true, onClick: () => trashNote(id) },
  ]);
});
$('#btn-restore').addEventListener('click', () => S.currentId && restoreNote(S.currentId));

async function exportNote(kind) {
  if (!S.currentId) return;
  await flushSave();
  const n = noteById(S.currentId);
  const html = editor.getHTML();
  const ok = await api.exportNote(kind, n?.title || t('note.untitled'), kind === 'md' ? htmlToMarkdown(html) : html);
  if (ok) toast(t(`toast.exported.${kind}`));
}

async function shareNote(how) {
  const title =
    editor
      .getText()
      .split('\n')
      .find((l) => l.trim())
      ?.trim() || t('share.defaultTitle');
  try {
    if (how === 'text') {
      await navigator.clipboard.writeText(editor.getText({ blockSeparator: '\n\n' }));
      toast(t('toast.copiedText'));
    } else if (how === 'md-copy') {
      await navigator.clipboard.writeText(htmlToMarkdown(editor.getHTML()));
      toast(t('toast.copiedMd'));
    } else if (how === 'mail') {
      const body = editor.getText({ blockSeparator: '\n\n' });
      const cut = body.length > 1500;
      window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(cut ? body.slice(0, 1500) + '…' : body)}`);
      if (cut) toast(t('toast.mailCut'));
    }
  } catch {
    toast(t('toast.copyFailed'));
  }
}

// ---------------------------------------------------------------- navegación, menú y eventos del sistema
$('#btn-new').addEventListener('click', () => newNote());
$('#btn-side').addEventListener('click', () => {
  app.dataset.pane = 'side';
});
$('#btn-back').addEventListener('click', () => {
  app.dataset.pane = 'list';
});

api.on('menu', async (cmd) => {
  switch (cmd) {
    case 'new-note':
      newNote();
      break;
    case 'new-folder':
      newFolder();
      break;
    case 'import':
      importNotes();
      break;
    case 'help':
      openHelp('start');
      break;
    case 'help-keys':
      openHelp('keys');
      break;
    case 'export-pdf':
      exportNote('pdf');
      break;
    case 'export-html':
      exportNote('html');
      break;
    case 'export-md':
      exportNote('md');
      break;
    case 'focus-search':
      app.dataset.pane = 'list';
      $('#search').focus();
      $('#search').select();
      break;
    case 'view-list':
      setView('list');
      break;
    case 'view-gallery':
      setView('gallery');
      break;
    case 'change-vault':
      changeVault();
      break;
    case 'settings':
      openSettings();
      break;
  }
});

// otro programa (Syncthing, Nextcloud…) cambió archivos de la carpeta
api.on('notes:external-change', async () => {
  [S.folders, S.notes, S.smart] = await Promise.all([api.folders.list(), api.notes.list(), api.smart.list()]);
  renderAll();
  const cur = S.currentId && noteById(S.currentId);
  if (S.currentId && !cur) {
    closeNote();
    return;
  }
  if (cur && !S.dirty && cur.updated > S.curUpdated) await openNote(S.currentId, { keepFocus: true });
});

window.addEventListener('beforeunload', () => {
  flushSave();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSave();
});

// ---------------------------------------------------------------- enlaces entre notas
function linkTitle(id) {
  const n = noteById(id);
  if (!n || n.deletedAt) return null;
  return n.locked ? t('note.locked') : n.title || t('note.untitled');
}

function suggestNotes(q) {
  const pool = live().filter((n) => !n.locked && n.id !== S.currentId);
  const t = q.trim();
  const found = t ? search(pool, t, searchCtx).map((h) => h.note) : pool.sort((a, b) => b.updated - a.updated);
  return found.slice(0, 6).map((n) => ({ id: n.id, title: n.title || t('note.untitled') }));
}

async function createLinkedNote(title) {
  const here = noteById(S.currentId);
  const n = await api.notes.create(here?.folderId);
  const html = `<p>${esc(title)}</p>`;
  const meta = await api.notes.save({ id: n.id, title, preview: '', thumb: '', html, text: title, tags: [] });
  S.notes.push({ ...meta, text: title });
  renderAll();
  return n.id;
}

async function openLinked(id) {
  const n = noteById(id);
  if (!n) {
    toast(t('toast.noteGone'));
    return;
  }
  if (n.deletedAt) toast(t('toast.noteInTrash'));
  await openNote(id);
}

function renderBacklinks() {
  const el = $('#backlinks');
  const here = S.currentId && noteById(S.currentId);
  const refs = here && !here.locked ? live().filter((n) => n.id !== here.id && !n.locked && n.links?.includes(here.id)) : [];
  el.hidden = !refs.length;
  if (!refs.length) return;
  el.innerHTML = `<span>${esc(t('backlinks.label'))}</span>${refs.map((n) => `<button type="button" data-open="${esc(n.id)}" title="${esc(n.title || t('note.untitled'))}">${esc(n.title || t('note.untitled'))}</button>`).join('')}`;
}
$('#backlinks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) openNote(b.dataset.open);
});

// ---------------------------------------------------------------- historial de versiones
async function openHistory() {
  const id = S.currentId;
  if (!id) return;
  await flushSave();
  const versions = await api.history.list(id);
  if (!versions.length) {
    toast(t('history.none'));
    return;
  }
  const t = await historyDialog({
    versions,
    fmt: longDate,
    load: (when) => api.history.get(id, when),
  });
  if (!t) {
    editor.commands.focus();
    return;
  }
  const n = await api.history.restore(id, t);
  if (!n) {
    toast(t('history.restoreFailed'));
    return;
  }
  S.notes = await api.notes.list();
  S.curUpdated = n.updated;
  showNote(n, {});
  renderAll();
  toast(t('history.restored'));
}

// ---------------------------------------------------------------- ajustes
async function changeVault() {
  await flushSave();
  if (await api.vault.change()) {
    S.currentId = null;
    closeNote();
    await reload();
    toast(t('toast.vaultChanged'));
  }
}

async function openSettings() {
  const [prefs, vault] = await Promise.all([api.prefs.get(), api.vault.info()]);
  await settingsDialog({
    prefs,
    api,
    vault: vault.dir,
    view: S.view,
    sort: S.sort,
    onView: setView,
    onSort: (v) => {
      S.sort = v;
      store.set('sort', v);
      renderList();
    },
    onChangeVault: changeVault,
    onLanguage: async () => {
      await flushSave();
      location.reload();
    },
  });
}
$('#btn-settings').addEventListener('click', openSettings);

// ---------------------------------------------------------------- ayuda
async function openHelp(tab = 'start') {
  const info = await api.appInfo().catch(() => ({}));
  const r = await helpDialog({ version: info.version || '', tab });
  if (!r) return;
  if (r.search) {
    S.scope = { type: 'all' };
    S.q = r.search;
    $('#search').value = r.search;
    app.dataset.pane = 'list';
    renderAll();
    return;
  }
  switch (r.act) {
    case 'new-folder':
      await newFolder();
      break;
    case 'smart':
      await editSmart(null);
      break;
    case 'import':
      await importNotes();
      break;
    case 'open-vault':
      await api.vault.open();
      break;
    case 'settings':
      await openSettings();
      break;
    case 'search':
      app.dataset.pane = 'list';
      $('#search').focus();
      break;
  }
}
$('#btn-help').addEventListener('click', () => openHelp());

// ---------------------------------------------------------------- importar
async function importNotes() {
  const kind = await importDialog();
  if (!kind) return;
  await flushSave();
  const r = await api.importNotes(kind);
  if (!r) return;
  if (!r.items.length) {
    toast(t('toast.importNone'));
    return;
  }
  const tmp = createEditor({ element: document.createElement('div'), links: { getTitle: () => null, onOpen() {}, suggest: () => [], create: async () => '' } });
  const key = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const ids = r.items.map(() => crypto.randomUUID());
  const byTitle = new Map();
  r.items.forEach((it, i) => {
    if (!byTitle.has(key(it.title))) byTitle.set(key(it.title), ids[i]);
  });
  const folderIds = new Map();
  let done = 0;
  try {
    for (let i = 0; i < r.items.length; i++) {
      const it = r.items[i];
      // [[Título]] de Obsidian y similares -> enlace real si esa nota también se importó
      let html = it.html.replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g, (m, t, alias) => {
        const id = byTitle.get(key(t));
        return id ? `<a data-note-link="${id}">${esc(alias || t)}</a>` : m;
      });
      if (it.tags?.length) html += `<p>${it.tags.map((t) => `#${t}`).join(' ')}</p>`;
      tmp.commands.setContent(html, { emitUpdate: false });
      let snap = snapshot(tmp);
      if (key(snap.title) !== key(it.title)) {
        tmp.commands.setContent(`<p>${esc(it.title)}</p>${html}`, { emitUpdate: false });
        snap = snapshot(tmp);
      }
      const fk = it.folder.join('\u0000');
      if (!folderIds.has(fk)) folderIds.set(fk, await api.folders.ensurePath(it.folder));
      await api.notes.createFull({ id: ids[i], ...snap, folderId: folderIds.get(fk), created: it.created, updated: it.updated });
      done++;
      if (done % 15 === 0) toast(t('toast.importing', { done, total: r.items.length }));
    }
  } finally {
    tmp.destroy();
  }
  await reload();
  S.scope = { type: 'all' };
  renderAll();
  const skipped = r.skipped?.length ? t('toast.importSkipped', { n: r.skipped.length }) : '';
  toast(tn('toast.imported', done, { skipped }));
}

// ---------------------------------------------------------------- arranque
function renderAll() {
  renderSide();
  renderList();
  renderBacklinks();
}

const task = (done, text) => `<li data-type="taskItem" data-checked="${done}"><label><input type="checkbox" ${done ? 'checked' : ''}><span></span></label><div><p>${text}</p></div></li>`;
// La nota de bienvenida se escribe en el idioma de la interfaz (los textos son de la app, no de la persona)
const welcomeHtml = () => `<h1>${t('welcome.title')}</h1>
<p>${t('welcome.intro')}</p>
<h2>${t('welcome.tryTitle')}</h2>
<ul data-type="taskList">${[1, 2, 3, 4, 5].map((i) => task(i === 1, t(`welcome.task${i}`))).join('')}</ul>
<h2>${t('welcome.whereTitle')}</h2>
<ul>${[1, 2, 3, 4, 5, 6].map((i) => `<li><p>${t(`welcome.where${i}`)}</p></li>`).join('\n')}</ul>
<p>${t('welcome.tags')}</p>`;

async function start() {
  initUpdates({ flush: flushSave, toast });
  editor = createEditor({
    element: $('#editor'),
    onUpdate: onEditorUpdate,
    onSelection: syncToolbar,
    onLink: editLink,
    links: { getTitle: linkTitle, onOpen: openLinked, suggest: suggestNotes, create: createLinkedNote },
  });
  app.dataset.pane = 'list';
  [S.folders, S.notes, S.smart] = await Promise.all([api.folders.list(), api.notes.list(), api.smart.list()]);
  if (!S.notes.length && !store.get('welcomed')) {
    store.set('welcomed', '1');
    const n = await api.notes.create();
    const { html: _h, ...meta } = n;
    const tmp = createEditor({ element: document.createElement('div') });
    tmp.commands.setContent(welcomeHtml());
    const snap = snapshot(tmp);
    tmp.destroy();
    Object.assign(meta, await api.notes.save({ id: n.id, ...snap }), { text: snap.text });
    S.notes.push(meta);
  }
  renderAll();
  const first = visibleNotes()[0];
  if (first) await openNote(first.id, { keepFocus: true });
  app.dataset.pane = 'list';
}
start();
