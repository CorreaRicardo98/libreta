// Guía rápida dentro de la app: dónde está cada función y cómo se usa.
import { dialog, esc } from './ui.js';

const REPO = 'https://github.com/CorreaRicardo98/libreta';

const CARDS = [
  { t: 'Organizar con carpetas', where: 'Botón «Nueva…», abajo a la izquierda',
    how: 'Crea carpetas y, con clic derecho sobre una carpeta, subcarpetas. Arrastra una nota de la lista hasta una carpeta para moverla.',
    act: ['new-folder', 'Crear una carpeta'] },
  { t: 'Carpetas inteligentes', where: '«Nueva…» → Carpeta inteligente…',
    how: 'Reúnen solas las notas que cumplan tus reglas: con tareas, con imágenes, con una etiqueta, con cierto texto… Aparecen en «Inteligentes».',
    act: ['smart', 'Crear una carpeta inteligente'] },
  { t: 'Insertar imágenes, archivos, dibujos y escaneos', where: 'Barra del editor: imagen, clip, lápiz y cuadro de escaneo',
    how: 'También puedes pegar o arrastrar imágenes y archivos directo a la nota. El escáner usa la cámara y deja elegir entre Documento, Grises y Color.' },
  { t: 'Enlazar notas entre sí', where: 'Dentro de una nota',
    how: 'Escribe «[[» y elige otra nota (o crea una nueva). Al pie de cada nota aparece «Mencionada en» con las notas que la enlazan.' },
  { t: 'Buscar con filtros', where: 'Buscador de la lista de notas',
    how: 'Ignora acentos y perdona errores de escritura. Prueba filtros como tag:ideas o tiene:imagen (pestaña «Buscar»). Una búsqueda se puede guardar como carpeta inteligente.',
    act: ['search', 'Ir al buscador'] },
  { t: 'Volver a una versión anterior', where: 'Menú «…» del editor (arriba a la derecha) → Historial de versiones',
    how: 'Libreta guarda una versión cada 5 minutos de edición. Elige una fecha, mira cómo era la nota y restáurala; lo que había antes también se conserva.' },
  { t: 'Bloquear una nota con contraseña', where: 'Icono de candado de la barra del editor',
    how: 'La nota se cifra en el disco. Si olvidas la contraseña no hay forma de recuperarla, y las imágenes y adjuntos no se cifran.' },
  { t: 'Compartir y exportar', where: 'Menú «…» del editor',
    how: 'Copia como texto o Markdown, envía por correo, o exporta a PDF, HTML o Markdown.' },
  { t: 'Traer tus notas de otro programa', where: 'Archivo → Importar notas…',
    how: 'Acepta carpetas de Markdown, texto o HTML (Joplin, Obsidian, Bear, Notion) y archivos de Evernote (.enex). Apple Notes hay que exportarla antes con una herramienta aparte.',
    act: ['import', 'Importar notas'] },
  { t: 'Personalizar Libreta', where: 'Archivo → Ajustes… (Ctrl + ,) o el botón «Ajustes» de la barra lateral',
    how: 'Elige tema claro, oscuro o el de tu sistema, un color de acento, la letra y el tamaño del texto de las notas, el ancho de la página y la vista de la lista. Los cambios se ven al instante.',
    act: ['settings', 'Abrir Ajustes'] },
  { t: 'Mantener Libreta al día', where: 'Ayuda → Buscar actualizaciones…',
    how: 'Libreta revisa cada pocas horas si hay una versión nueva en GitHub y te avisa con una tarjeta en la esquina; nada se instala sin que lo aceptes. Solo consulta la lista de versiones y no envía tus notas. Puedes desactivar la revisión en Ayuda → Buscar actualizaciones automáticamente.' },
  { t: 'Tus notas son archivos tuyos', where: 'Archivo → Abrir carpeta de notas',
    how: 'Cada nota es un archivo. Puedes cambiar la carpeta desde Archivo → Cambiar carpeta de notas y sincronizarla con Syncthing, Nextcloud o Dropbox.',
    act: ['open-vault', 'Abrir la carpeta de notas'] },
];

const FILTERS = [
  ['tag:ideas', 'Notas con la etiqueta #ideas'],
  ['carpeta:trabajo', 'Notas que están en una carpeta llamada «trabajo»'],
  ['tiene:imagen', 'Notas con imágenes (también tareas, adjunto, tabla y enlace)'],
  ['es:fijada', 'Notas fijadas (también es:bloqueada)'],
  ['antes:2026-01-31', 'Editadas antes de esa fecha (despues: para lo contrario)'],
  ['"frase exacta"', 'Esa frase tal cual, entre comillas'],
  ['presupuesto -cliente', 'Con «presupuesto» pero sin «cliente»'],
];

const KEYS = [
  ['Nota nueva', 'Ctrl + N'], ['Carpeta nueva', 'Ctrl + Mayús + N'], ['Buscar notas', 'Ctrl + F'],
  ['Ver como lista / galería', 'Ctrl + 1 / Ctrl + 2'], ['Negrita / cursiva / subrayado', 'Ctrl + B / I / U'],
  ['Enlace web', 'Ctrl + K'], ['Lista de tareas', 'Ctrl + Mayús + 9'], ['Enlazar otra nota', '[['],
  ['Deshacer / rehacer', 'Ctrl + Z / Ctrl + Mayús + Z'], ['Mover a la papelera', 'Supr (con la nota seleccionada en la lista)'],
  ['Cambiar de nota en la lista', '↑ / ↓'], ['Abrir Ajustes', 'Ctrl + ,'], ['Abrir esta guía', 'F1'],
];

/**
 * Resuelve con { act } (una acción de las tarjetas), { search } (un filtro para probar) o null.
 * tab: 'start' | 'search' | 'keys'.
 */
export function helpDialog({ version = '', tab = 'start' }) {
  return dialog((box, done) => {
    box.classList.add('wide', 'help');
    box.innerHTML = `
      <h2>Guía rápida</h2>
      <div class="seg help-tabs" role="tablist" aria-label="Secciones">
        <button type="button" class="seg-btn txt" role="tab" data-tab="start">Empezar</button>
        <button type="button" class="seg-btn txt" role="tab" data-tab="search">Buscar</button>
        <button type="button" class="seg-btn txt" role="tab" data-tab="keys">Atajos</button>
      </div>
      <div class="help-body" tabindex="0"></div>
      <div class="help-foot muted">
        <span>Libreta ${esc(version)} · Licencia MIT</span>
        <span><a href="${REPO}" target="_blank" rel="noreferrer">Código y comunidad</a> · <a href="${REPO}/issues/new/choose" target="_blank" rel="noreferrer">Reportar un error</a></span>
      </div>
      <div class="row"><button type="button" data-no class="btn-primary">Cerrar</button></div>`;
    const body = box.querySelector('.help-body');
    const tabs = [...box.querySelectorAll('[data-tab]')];

    const render = (name) => {
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      body.scrollTop = 0;
      if (name === 'start') {
        body.innerHTML = CARDS.map((c, i) => `
          <section class="help-card">
            <h3>${esc(c.t)}</h3>
            <p class="help-where">${esc(c.where)}</p>
            <p>${esc(c.how)}</p>
            ${c.act ? `<button type="button" data-act="${i}">${esc(c.act[1])}</button>` : ''}
          </section>`).join('');
      } else if (name === 'search') {
        body.innerHTML = `<p class="muted" style="margin-top:0">Escribe en el buscador de la lista. No importan los acentos ni las mayúsculas y se perdonan errores de escritura. Puedes combinar varios filtros.</p>
          <table class="help-table">${FILTERS.map(([q, d], i) => `<tr><td><code>${esc(q)}</code></td><td>${esc(d)}</td><td><button type="button" data-try="${i}">Probar</button></td></tr>`).join('')}</table>`;
      } else {
        body.innerHTML = `<table class="help-table">${KEYS.map(([a, k]) => `<tr><td>${esc(a)}</td><td><kbd>${esc(k)}</kbd></td></tr>`).join('')}</table>`;
      }
    };

    tabs.forEach((b) => b.addEventListener('click', () => render(b.dataset.tab)));
    body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) return done({ act: CARDS[Number(a.dataset.act)].act[0] });
      const t = e.target.closest('[data-try]');
      if (t) return done({ search: FILTERS[Number(t.dataset.try)][0] });
    });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    box.addEventListener('submit', (e) => e.preventDefault());
    render(tab);
    setTimeout(() => box.querySelector('[data-no]').focus());
  });
}
