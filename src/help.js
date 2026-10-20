// Guía rápida dentro de la app: dónde está cada función y cómo se usa.
import { dialog, esc } from './ui.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/CorreaRicardo98/libreta';

// id de la tarjeta -> acción que lanza (si tiene). Los textos están en los archivos de idioma: help.card.<id>.*
const CARDS = [
  ['folders', 'new-folder'],
  ['smart', 'smart'],
  ['templates', 'templates'],
  ['insert'],
  ['links'],
  ['search', 'search'],
  ['history'],
  ['lock'],
  ['share'],
  ['import', 'import'],
  ['backup', 'settings'],
  ['settings', 'settings'],
  ['updates'],
  ['vault', 'open-vault'],
];
const FILTER_COUNT = 7;
const KEY_COUNT = 13;

/**
 * Resuelve con { act } (una acción de las tarjetas), { search } (un filtro para probar) o null.
 * tab: 'start' | 'search' | 'keys'.
 */
export function helpDialog({ version = '', tab = 'start' }) {
  return dialog((box, done) => {
    box.classList.add('wide', 'help');
    box.innerHTML = `
      <h2>${esc(t('help.title'))}</h2>
      <div class="seg help-tabs" role="tablist" aria-label="${esc(t('help.sections'))}">
        ${['start', 'search', 'keys'].map((k) => `<button type="button" class="seg-btn txt" role="tab" data-tab="${k}">${esc(t(`help.tab.${k}`))}</button>`).join('')}
      </div>
      <div class="help-body" tabindex="0"></div>
      <div class="help-foot muted">
        <span>Libreta ${esc(version)} · ${esc(t('help.license'))}</span>
        <span><a href="${REPO}" target="_blank" rel="noreferrer">${esc(t('help.code'))}</a> · <a href="${REPO}/issues/new/choose" target="_blank" rel="noreferrer">${esc(t('help.report'))}</a></span>
      </div>
      <div class="row"><button type="button" data-no class="btn-primary">${esc(t('help.close'))}</button></div>`;
    const body = box.querySelector('.help-body');
    const tabs = [...box.querySelectorAll('[data-tab]')];
    const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

    const render = (name) => {
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      body.scrollTop = 0;
      if (name === 'start') {
        body.innerHTML = CARDS.map(
          ([id, act], i) => `
          <section class="help-card">
            <h3>${esc(t(`help.card.${id}.t`))}</h3>
            <p class="help-where">${esc(t(`help.card.${id}.where`))}</p>
            <p>${esc(t(`help.card.${id}.how`))}</p>
            ${act ? `<button type="button" data-act="${i}">${esc(t(`help.card.${id}.act`))}</button>` : ''}
          </section>`,
        ).join('');
      } else if (name === 'search') {
        body.innerHTML = `<p class="muted" style="margin-top:0">${esc(t('help.searchIntro'))}</p>
          <table class="help-table">${range(FILTER_COUNT)
            .map((i) => `<tr><td><code>${esc(t(`help.f${i}.q`))}</code></td><td>${esc(t(`help.f${i}.d`))}</td><td><button type="button" data-try="${i}">${esc(t('help.try'))}</button></td></tr>`)
            .join('')}</table>`;
      } else {
        body.innerHTML = `<table class="help-table">${range(KEY_COUNT)
          .map((i) => `<tr><td>${esc(t(`help.k${i}.a`))}</td><td><kbd>${esc(t(`help.k${i}.k`))}</kbd></td></tr>`)
          .join('')}</table>`;
      }
    };

    tabs.forEach((b) => b.addEventListener('click', () => render(b.dataset.tab)));
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) return done({ act: CARDS[Number(a.dataset.act)][1] });
      const tr = e.target.closest('[data-try]');
      if (tr) return done({ search: t(`help.f${tr.dataset.try}.q`) });
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    box.addEventListener('submit', (e) => e.preventDefault());
    render(tab);
    setTimeout(() => box.querySelector('[data-no]').focus());
  });
}
