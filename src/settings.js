// Ajustes: apariencia, notas y programa. Los cambios se aplican al instante.
import { dialog, esc, longDate } from './ui.js';
import { t } from './i18n.js';

const FONT_STACK = { serif: 'var(--serif)', sans: 'var(--ui)', mono: 'var(--mono)' };
const WIDTH_REM = { narrow: '38rem', normal: '46rem', wide: '62rem' };

/** Pinta las preferencias en la interfaz (colores, tipografía y ancho de las notas). */
export function applyPrefs(p) {
  const r = document.documentElement;
  r.dataset.accent = p.accent;
  r.style.setProperty('--doc-font', FONT_STACK[p.font] || FONT_STACK.serif);
  r.style.setProperty('--doc-size', `${p.size}px`);
  r.style.setProperty('--doc-scale', String(p.size / 17));
  r.style.setProperty('--doc-width', WIDTH_REM[p.width] || WIDTH_REM.normal);
}

const ACCENTS = [
  ['azul', '#2640c4'],
  ['verde', '#0f7a55'],
  ['violeta', '#6b3fd1'],
  ['coral', '#c23b3b'],
  ['ambar', '#a85d00'],
  ['grafito', '#374151'],
];

/** Fila con botones segmentados. Las etiquetas se buscan en set.<clave>.<valor>. */
const seg = (key, values) => `
  <div class="set-row">
    <span class="set-label" id="lb-${key}">${esc(t(`set.${key}`))}</span>
    <div class="seg" role="group" aria-labelledby="lb-${key}">
      ${values.map((v) => `<button type="button" class="seg-btn txt" data-key="${key}" data-val="${esc(v)}">${esc(t(`set.${key}.${v}`))}</button>`).join('')}
    </div>
  </div>`;

/**
 * prefs: preferencias actuales. api: window.libreta.
 * view/sort: valores actuales de la lista; onView/onSort/onChangeVault/onLanguage: acciones de la app.
 */
export function settingsDialog({ prefs, api, vault, view, sort, onView, onSort, onChangeVault, onLanguage }) {
  return dialog((box, done) => {
    box.classList.add('form', 'settings');
    const state = { ...prefs, view, sort };
    box.innerHTML = `
      <h2>${esc(t('set.title'))}</h2>
      <section aria-labelledby="s-look">
        <h3 id="s-look">${esc(t('set.look'))}</h3>
        ${seg('theme', ['system', 'light', 'dark'])}
        <p class="set-hint">${esc(t('set.themeHint'))}</p>
        <div class="set-row">
          <span class="set-label" id="lb-accent">${esc(t('set.color'))}</span>
          <div class="swatches" role="group" aria-labelledby="lb-accent">
            ${ACCENTS.map(([v, c]) => `<button type="button" class="sw" data-key="accent" data-val="${v}" style="--c:${c}" aria-label="${esc(t(`set.accent.${v}`))}" title="${esc(t(`set.accent.${v}`))}"></button>`).join('')}
          </div>
        </div>
        ${seg('language', ['system', 'es', 'en'])}
        <p class="set-hint">${esc(t('set.languageHint'))}</p>
        ${seg('font', ['serif', 'sans', 'mono'])}
        ${seg('size', ['15', '17', '19', '21'])}
        ${seg('width', ['narrow', 'normal', 'wide'])}
        <div class="pref-sample" aria-hidden="true"><b>${esc(t('set.sampleLead'))}</b> ${esc(t('set.sampleRest'))}</div>
      </section>
      <section aria-labelledby="s-notes">
        <h3 id="s-notes">${esc(t('set.notes'))}</h3>
        ${seg('view', ['list', 'gallery'])}
        ${seg('sort', ['updated', 'created', 'title'])}
        <div class="set-row">
          <span class="set-label">${esc(t('set.vault'))}</span>
          <div class="set-vault"><code title="${esc(vault)}">${esc(vault)}</code>
            <button type="button" data-act="open">${esc(t('set.open'))}</button><button type="button" data-act="change">${esc(t('set.change'))}</button></div>
        </div>
      </section>
      <section aria-labelledby="s-backup">
        <h3 id="s-backup">${esc(t('set.backup'))}</h3>
        <label class="chk set-chk"><input type="checkbox" id="bk-on">
          <span>${esc(t('set.bk.auto'))}<small>${esc(t('set.bk.autoHint'))}</small></span></label>
        <div class="set-row">
          <span class="set-label">${esc(t('set.bk.dir'))}</span>
          <div class="set-vault"><code id="bk-dir"></code><button type="button" data-bk-act="choose">${esc(t('set.bk.choose'))}</button></div>
        </div>
        <div class="set-row">
          <span class="set-label" id="lb-bk-every">${esc(t('set.bk.every'))}</span>
          <div class="seg" role="group" aria-labelledby="lb-bk-every">
            ${['daily', 'weekly'].map((v) => `<button type="button" class="seg-btn txt" data-bk="every" data-val="${v}">${esc(t(`set.bk.every.${v}`))}</button>`).join('')}
          </div>
        </div>
        <div class="set-row">
          <span class="set-label" id="lb-bk-keep">${esc(t('set.bk.keep'))}</span>
          <div class="seg" role="group" aria-labelledby="lb-bk-keep">
            ${[3, 7, 14, 30].map((v) => `<button type="button" class="seg-btn txt" data-bk="keep" data-val="${v}">${v}</button>`).join('')}
          </div>
        </div>
        <div class="set-row">
          <span class="set-label"></span>
          <div class="set-vault"><button type="button" id="bk-now" data-bk-act="now">${esc(t('set.bk.now'))}</button><button type="button" data-bk-act="reveal">${esc(t('set.bk.reveal'))}</button></div>
        </div>
        <p class="set-hint" id="bk-status" role="status" aria-live="polite"></p>
      </section>
      <section aria-labelledby="s-app">
        <h3 id="s-app">${esc(t('set.app'))}</h3>
        <label class="chk set-chk"><input type="checkbox" id="set-auto" ${prefs.autoUpdate ? 'checked' : ''}>
          <span>${esc(t('set.auto'))}<small>${esc(t('set.autoHint'))}</small></span></label>
      </section>
      <div class="row"><button type="button" data-act="reset">${esc(t('set.reset'))}</button><button type="button" data-no class="btn-primary">${esc(t('set.done'))}</button></div>`;

    const paint = () => {
      box.querySelectorAll('[data-key]').forEach((b) => {
        const v = state[b.dataset.key];
        b.setAttribute('aria-pressed', String(String(v) === b.dataset.val));
      });
    };
    const set = async (patch) => {
      Object.assign(state, patch);
      const { view: v, sort: s, ...appearance } = patch;
      if (v) onView(v);
      if (s) onSort(s);
      if (Object.keys(appearance).length) {
        Object.assign(state, await api.prefs.set(appearance));
        applyPrefs(state);
      }
      paint();
      if (patch.language) {
        done(null);
        onLanguage();
      } // el idioma se aplica al volver a cargar la interfaz
    };

    // ---- copias de seguridad
    let bk = { enabled: false, dir: '', every: 'daily', keep: 7, last: 0, lastError: '' };
    const bkStatus = box.querySelector('#bk-status');
    const paintBackup = (msg) => {
      box.querySelector('#bk-on').checked = bk.enabled;
      const dirEl = box.querySelector('#bk-dir');
      dirEl.textContent = bk.dir || t('set.bk.none');
      dirEl.title = bk.dir;
      box.querySelectorAll('[data-bk]').forEach((b) => b.setAttribute('aria-pressed', String(String(bk[b.dataset.bk]) === b.dataset.val)));
      box.querySelector('#bk-now').disabled = !bk.dir;
      bkStatus.textContent = msg || (bk.lastError ? t('set.bk.error', { msg: bk.lastError }) : bk.last ? t('set.bk.last', { date: longDate(bk.last) }) : t('set.bk.never'));
    };
    api.backup.get().then((c) => {
      bk = c;
      paintBackup();
    });
    const bkSet = async (patch) => {
      bk = await api.backup.set(patch);
      paintBackup();
    };
    const bkChoose = async () => {
      bk = await api.backup.chooseDir();
      paintBackup();
      return !!bk.dir;
    };

    box.addEventListener('click', async (e) => {
      const bkb = e.target.closest('[data-bk]');
      if (bkb) {
        await bkSet({ [bkb.dataset.bk]: bkb.dataset.bk === 'keep' ? Number(bkb.dataset.val) : bkb.dataset.val });
        return;
      }
      const bka = e.target.closest('[data-bk-act]')?.dataset.bkAct;
      if (bka === 'choose') {
        await bkChoose();
        return;
      }
      if (bka === 'reveal') {
        api.backup.reveal();
        return;
      }
      if (bka === 'now') {
        const btn = box.querySelector('#bk-now');
        btn.disabled = true;
        btn.textContent = t('set.bk.working');
        const r = await api.backup.now();
        bk = r.config;
        btn.textContent = t('set.bk.now');
        paintBackup(r.ok ? t('set.bk.done', { name: String(r.file).split(/[\\/]/).pop() }) : null);
        return;
      }
      const b = e.target.closest('[data-key]');
      if (b) {
        const k = b.dataset.key;
        await set({ [k]: k === 'size' ? Number(b.dataset.val) : b.dataset.val });
        return;
      }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'open') api.vault.open();
      else if (a === 'change') {
        done(null);
        onChangeVault();
      } else if (a === 'reset') await set({ theme: 'system', accent: 'azul', font: 'serif', size: 17, width: 'normal' });
    });
    box.querySelector('#bk-on').addEventListener('change', async (e) => {
      const on = e.target.checked;
      if (on && !bk.dir && !(await bkChoose())) {
        e.target.checked = false; // sin carpeta no se puede activar
        return;
      }
      await bkSet({ enabled: on });
    });
    box.querySelector('#set-auto').addEventListener('change', (e) => api.prefs.set({ autoUpdate: e.target.checked }));
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    box.addEventListener('submit', (e) => e.preventDefault());
    paint();
    box.tabIndex = -1;
    setTimeout(() => box.focus()); // foco en el diálogo (no en un botón) para que se abra arriba y sin parecer una selección
  });
}
