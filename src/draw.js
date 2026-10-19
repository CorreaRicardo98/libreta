// Dibujo a mano y escáner de documentos con la cámara. Ambos devuelven archivos de imagen.
import { dialog, esc } from './ui.js';

const COLORS = ['#1b2430', '#2640c4', '#d6342c', '#1f9d55', '#f2a900', '#8a4fff'];

const toFile = (canvas, name, type = 'image/png', q) =>
  new Promise((res) => canvas.toBlob((b) => res(new File([b], name, { type })), type, q));

/** Abre el lienzo de dibujo. Resuelve con un File PNG o null si se cancela. */
export function drawDialog() {
  return dialog((box, done) => {
    box.classList.add('wide');
    box.innerHTML = `
      <h2>Dibujo</h2>
      <div class="draw-tools">
        <div class="seg" role="group" aria-label="Herramienta">
          <button type="button" class="seg-btn txt" data-tool="pen" aria-pressed="true">Lápiz</button>
          <button type="button" class="seg-btn txt" data-tool="marker" aria-pressed="false">Marcador</button>
          <button type="button" class="seg-btn txt" data-tool="eraser" aria-pressed="false">Borrador</button>
        </div>
        <div class="swatches" role="group" aria-label="Color">${COLORS.map((c, i) => `<button type="button" class="sw" data-color="${c}" style="--c:${c}" aria-label="Color ${i + 1}" aria-pressed="${i === 0}"></button>`).join('')}</div>
        <label class="grosor">Grosor <input type="range" min="1" max="24" value="3" id="dw-size"></label>
        <span class="tb-grow"></span>
        <button type="button" data-undo>Deshacer</button>
        <button type="button" data-clear>Borrar todo</button>
      </div>
      <canvas class="draw-canvas" width="1200" height="720" aria-label="Lienzo de dibujo"></canvas>
      <div class="row"><button type="button" data-no>Cancelar</button><button type="submit" class="btn-primary">Insertar dibujo</button></div>`;
    const cv = box.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const paper = () => { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); };
    paper();
    const history = [ctx.getImageData(0, 0, cv.width, cv.height)];
    const st = { tool: 'pen', color: COLORS[0], size: 3, down: false, last: null };

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    };
    const style = (p) => {
      ctx.lineCap = ctx.lineJoin = 'round';
      const k = p && p > 0 ? 0.5 + p : 1;
      if (st.tool === 'eraser') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = st.size * 4; }
      else if (st.tool === 'marker') { ctx.globalCompositeOperation = 'multiply'; ctx.strokeStyle = st.color + '66'; ctx.lineWidth = st.size * 4; }
      else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = st.color; ctx.lineWidth = st.size * k; }
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      st.down = true; st.last = pos(e);
      style(e.pressure); ctx.beginPath(); ctx.moveTo(st.last.x, st.last.y); ctx.lineTo(st.last.x + .01, st.last.y); ctx.stroke();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!st.down) return;
      const p = pos(e);
      style(e.pressure); ctx.beginPath(); ctx.moveTo(st.last.x, st.last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      st.last = p;
    });
    const up = () => { if (!st.down) return; st.down = false; history.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (history.length > 30) history.shift(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    const pressed = (sel, attr, val) => box.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
    box.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { st.tool = b.dataset.tool; pressed('[data-tool]', 'tool', st.tool); }));
    box.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
      st.color = b.dataset.color; if (st.tool === 'eraser') { st.tool = 'pen'; pressed('[data-tool]', 'tool', 'pen'); }
      pressed('[data-color]', 'color', st.color);
    }));
    box.querySelector('#dw-size').addEventListener('input', (e) => { st.size = Number(e.target.value); });
    box.querySelector('[data-undo]').addEventListener('click', () => { if (history.length > 1) { history.pop(); ctx.putImageData(history[history.length - 1], 0, 0); } });
    box.querySelector('[data-clear]').addEventListener('click', () => { paper(); history.push(ctx.getImageData(0, 0, cv.width, cv.height)); });
    box.querySelector('[data-no]').addEventListener('click', () => done(null));
    box.addEventListener('submit', async (e) => { e.preventDefault(); done(await toFile(cv, `dibujo-${Date.now()}.png`)); });
  });
}

/**
 * Escáner: muestra la cámara y entrega cada captura a onCapture(File).
 * Filtros: color, documento (alto contraste en blanco y negro) y grises.
 */
export function scanDialog(onCapture) {
  return dialog((box, done) => {
    box.classList.add('wide');
    box.innerHTML = `
      <h2>Escanear documento</h2>
      <div class="scan-stage"><video autoplay playsinline muted aria-label="Vista de la cámara"></video><p class="scan-msg muted">Abriendo la cámara…</p></div>
      <div class="draw-tools">
        <div class="seg" role="group" aria-label="Filtro">
          <button type="button" class="seg-btn txt" data-f="doc" aria-pressed="true">Documento</button>
          <button type="button" class="seg-btn txt" data-f="gray" aria-pressed="false">Grises</button>
          <button type="button" class="seg-btn txt" data-f="color" aria-pressed="false">Color</button>
        </div>
        <span class="tb-grow"></span>
        <span class="muted" data-count></span>
      </div>
      <div class="row"><button type="button" data-no>Listo</button><button type="submit" class="btn-primary" disabled>Capturar página</button></div>`;
    const video = box.querySelector('video');
    const msg = box.querySelector('.scan-msg');
    const shoot = box.querySelector('[type=submit]');
    let stream = null; let filter = 'doc'; let n = 0;
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    const finish = () => { stop(); done(null); };

    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => { stream = s; video.srcObject = s; msg.remove(); shoot.disabled = false; })
      .catch(() => { msg.textContent = 'No se pudo abrir la cámara. Revisa que esté conectada y que ningún otro programa la use.'; });

    box.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.f;
      box.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    box.querySelector('[data-no]').addEventListener('click', finish);
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      const x = c.getContext('2d');
      x.drawImage(video, 0, 0);
      if (filter !== 'color') {
        const img = x.getImageData(0, 0, c.width, c.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (filter === 'doc') g = g > 150 ? 255 : Math.max(0, (g - 40) * 1.2);
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        x.putImageData(img, 0, 0);
      }
      n++;
      box.querySelector('[data-count]').textContent = `${n} ${n === 1 ? 'página insertada' : 'páginas insertadas'}`;
      await onCapture(await toFile(c, `escaneo-${Date.now()}.jpg`, 'image/jpeg', 0.9));
    });
    // al cerrar con Escape o clic fuera también hay que soltar la cámara
    const obs = new MutationObserver(() => { if (!document.body.contains(box)) { stop(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

export { esc };
