// Ajustes: apariencia, notas y programa. Los cambios se aplican al instante.
import { dialog, esc } from './ui.js';

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

const THEMES = [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];
const ACCENTS = [['azul', 'Azul', '#2640c4'], ['verde', 'Verde', '#0f7a55'], ['violeta', 'Violeta', '#6b3fd1'],
  ['coral', 'Coral', '#c23b3b'], ['ambar', 'Ámbar', '#a85d00'], ['grafito', 'Grafito', '#374151']];
const FONTS = [['serif', 'Con serifas'], ['sans', 'Sin serifas'], ['mono', 'Monoespaciada']];
const SIZES = [[15, 'Pequeño'], [17, 'Mediano'], [19, 'Grande'], [21, 'Muy grande']];
const WIDTHS = [['narrow', 'Estrecho'], ['normal', 'Normal'], ['wide', 'Ancho']];
const VIEWS = [['list', 'Lista'], ['gallery', 'Galería']];
const SORTS = [['updated', 'Edición'], ['created', 'Creación'], ['title', 'Título']];

const seg = (key, label, opts) => `
  <div class="set-row">
    <span class="set-label" id="lb-${key}">${esc(label)}</span>
    <div class="seg" role="group" aria-labelledby="lb-${key}">
      ${opts.map(([v, t]) => `<button type="button" class="seg-btn txt" data-key="${key}" data-val="${esc(v)}">${esc(t)}</button>`).join('')}
    </div>
  </div>`;

/**
 * prefs: preferencias actuales. api: window.libreta.
 * view/sort: valores actuales de la lista; onView/onSort/onChangeVault: acciones de la app.
 */
export function settingsDialog({ prefs, api, vault, view, sort, onView, onSort, onChangeVault }) {
  return dialog((box, done) => {
    box.classList.add('form', 'settings');
    const state = { ...prefs, view, sort };
    box.innerHTML = `
      <h2>Ajustes</h2>
      <section aria-labelledby="s-look">
        <h3 id="s-look">Apariencia</h3>
        ${seg('theme', 'Tema', THEMES)}
        <p class="set-hint">«Automático» sigue el tema claro u oscuro de tu sistema.</p>
        <div class="set-row">
          <span class="set-label" id="lb-accent">Color</span>
          <div class="swatches" role="group" aria-labelledby="lb-accent">
            ${ACCENTS.map(([v, t, c]) => `<button type="button" class="sw" data-key="accent" data-val="${v}" style="--c:${c}" aria-label="${esc(t)}" title="${esc(t)}"></button>`).join('')}
          </div>
        </div>
        ${seg('font', 'Letra de las notas', FONTS)}
        ${seg('size', 'Tamaño del texto', SIZES)}
        ${seg('width', 'Ancho de la página', WIDTHS)}
        <div class="pref-sample" aria-hidden="true"><b>Así se verá tu texto.</b> Libreta guarda cada nota como un archivo en tu carpeta, y tú decides cómo leerla.</div>
      </section>
      <section aria-labelledby="s-notes">
        <h3 id="s-notes">Notas</h3>
        ${seg('view', 'Vista de la lista', VIEWS)}
        ${seg('sort', 'Ordenar por', SORTS)}
        <div class="set-row">
          <span class="set-label">Carpeta de notas</span>
          <div class="set-vault"><code title="${esc(vault)}">${esc(vault)}</code>
            <button type="button" data-act="open">Abrir</button><button type="button" data-act="change">Cambiar…</button></div>
        </div>
      </section>
      <section aria-labelledby="s-app">
        <h3 id="s-app">Programa</h3>
        <label class="chk set-chk"><input type="checkbox" id="set-auto" ${prefs.autoUpdate ? 'checked' : ''}>
          <span>Buscar actualizaciones automáticamente<small>Consulta cada pocas horas la lista de versiones de GitHub. Nada se instala sin que lo aceptes.</small></span></label>
      </section>
      <div class="row"><button type="button" data-act="reset">Restablecer apariencia</button><button type="button" data-no class="btn-primary">Listo</button></div>`;

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
      if (Object.keys(appearance).length) { Object.assign(state, await api.prefs.set(appearance)); applyPrefs(state); }
      paint();
    };

    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-key]');
      if (b) { const k = b.dataset.key; await set({ [k]: k === 'size' ? Number(b.dataset.val) : b.dataset.val }); return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'open') api.vault.open();
      else if (a === 'change') { done(null); onChangeVault(); }
      else if (a === 'reset') await set({ theme: 'system', accent: 'azul', font: 'serif', size: 17, width: 'normal' });
    });
    box.querySelector('#set-auto').addEventListener('change', (e) => api.prefs.set({ autoUpdate: e.target.checked }));
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    box.addEventListener('submit', (e) => e.preventDefault());
    paint();
    box.tabIndex = -1;
    setTimeout(() => box.focus()); // foco en el diálogo (no en un botón) para que se abra arriba y sin parecer una selección
  });
}
