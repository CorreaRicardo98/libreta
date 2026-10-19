// Aviso de versión nueva: una tarjeta discreta en la esquina, sin interrumpir lo que se escribe.
import { esc } from './ui.js';

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
        show(`<strong>Hay una versión nueva</strong>
          <p>Libreta ${esc(u.version)} está disponible. Tus notas no se tocan.</p>
          <div class="uc-row">${u.canInstall
            ? '<button type="button" class="btn-primary" data-do="download">Descargar e instalar</button>'
            : '<button type="button" class="btn-primary" data-do="open">Abrir página de descargas</button>'}
            <button type="button" data-do="skip">Ahora no</button></div>`, (what) => {
          if (what === 'download') api.updates.download();
          else if (what === 'open') { api.updates.openReleases(); hide(); }
          else { store.set(SKIP_KEY, u.version); hide(); }
        });
        break;
      }
      case 'downloading':
        show(`<strong>Descargando la actualización…</strong>
          <div class="uc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.percent}"><i style="width:${u.percent}%"></i></div>
          <p>${u.percent} %</p>`, () => {});
        break;
      case 'ready':
        show(`<strong>Lista para instalar</strong>
          <p>Libreta ${esc(u.version)} se instala al reiniciar. Tus notas se guardan antes.</p>
          <div class="uc-row"><button type="button" class="btn-primary" data-do="install">Reiniciar y actualizar</button>
          <button type="button" data-do="later">Al cerrar la app</button></div>`, async (what) => {
          if (what === 'install') { await flush(); api.updates.install(); }
          else hide();
        });
        break;
      case 'error':
        show(`<strong>No se pudo actualizar</strong>
          <p>Puedes descargar la versión nueva a mano desde la página de versiones.</p>
          <div class="uc-row"><button type="button" class="btn-primary" data-do="open">Abrir página de descargas</button>
          <button type="button" data-do="close">Cerrar</button></div>`, (what) => {
          if (what === 'open') api.updates.openReleases();
          hide();
        });
        break;
      case 'none':
        hide();
        toast(`Ya tienes la última versión (${u.current}).`);
        break;
      case 'dev':
        toast('Las actualizaciones funcionan en la versión instalada, no en modo desarrollo.');
        break;
    }
  });
}
