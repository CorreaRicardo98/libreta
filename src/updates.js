// Aviso de versión nueva: una tarjeta discreta en la esquina, sin interrumpir lo que se escribe.
import { esc } from './ui.js';
import { t } from './i18n.js';

const api = window.libreta;
const SKIP_KEY = 'skipUpdate';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

let card = null;

function show(html, onClick) {
  if (!card) {
    card = document.createElement('div');
    card.className = 'update-card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    document.body.append(card);
  }
  card.innerHTML = html;
  card.onclick = (e) => { const b = e.target.closest('[data-do]'); if (b) onClick(b.dataset.do); };
}
const hide = () => { card?.remove(); card = null; };

/** flush: guarda la nota abierta antes de reiniciar. toast: aviso breve. */
export function initUpdates({ flush, toast }) {
  api.on('update', (u) => {
    switch (u.state) {
      case 'available': {
        if (!u.manual && store.get(SKIP_KEY) === u.version) return; // ya dijo «Ahora no» para esta versión
        show(`<strong>${esc(t('upd.availTitle'))}</strong>
          <p>${esc(t('upd.availText', { version: u.version }))}</p>
          <div class="uc-row">${u.canInstall
            ? `<button type="button" class="btn-primary" data-do="download">${esc(t('upd.install'))}</button>`
            : `<button type="button" class="btn-primary" data-do="open">${esc(t('upd.openPage'))}</button>`}
            <button type="button" data-do="skip">${esc(t('upd.skip'))}</button></div>`, (what) => {
          if (what === 'download') api.updates.download();
          else if (what === 'open') { api.updates.openReleases(); hide(); }
          else { store.set(SKIP_KEY, u.version); hide(); }
        });
        break;
      }
      case 'downloading':
        show(`<strong>${esc(t('upd.downloading'))}</strong>
          <div class="uc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.percent}"><i style="width:${u.percent}%"></i></div>
          <p>${u.percent} %</p>`, () => {});
        break;
      case 'ready':
        show(`<strong>${esc(t('upd.readyTitle'))}</strong>
          <p>${esc(t('upd.readyText', { version: u.version }))}</p>
          <div class="uc-row"><button type="button" class="btn-primary" data-do="install">${esc(t('upd.restart'))}</button>
          <button type="button" data-do="later">${esc(t('upd.onQuit'))}</button></div>`, async (what) => {
          if (what === 'install') { await flush(); api.updates.install(); }
          else hide();
        });
        break;
      case 'error':
        show(`<strong>${esc(t('upd.errorTitle'))}</strong>
          <p>${esc(t('upd.errorText'))}</p>
          <div class="uc-row"><button type="button" class="btn-primary" data-do="open">${esc(t('upd.openPage'))}</button>
          <button type="button" data-do="close">${esc(t('upd.close'))}</button></div>`, (what) => {
          if (what === 'open') api.updates.openReleases();
          hide();
        });
        break;
      case 'none':
        hide();
        toast(t('upd.none', { current: u.current }));
        break;
      case 'dev':
        toast(t('upd.dev'));
        break;
    }
  });
}
