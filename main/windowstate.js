// Tamaño y posición de la ventana: se guardan al cerrar y se restauran al abrir.
const DEFAULT = { width: 1180, height: 760 };
const MIN = { width: 720, height: 480 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Limpia lo guardado; devuelve null si no sirve. */
function sanitize(w) {
  if (!w || typeof w !== 'object' || !isNum(w.width) || !isNum(w.height)) return null;
  const out = {
    width: Math.max(MIN.width, Math.round(w.width)),
    height: Math.max(MIN.height, Math.round(w.height)),
    maximized: w.maximized === true,
  };
  if (isNum(w.x) && isNum(w.y)) { out.x = Math.round(w.x); out.y = Math.round(w.y); }
  return out;
}

/** ¿La ventana queda visible (al menos una franja razonable) en alguna pantalla? */
function visible(b, displays) {
  const need = 80;
  return displays.some((d) => {
    const a = d.workArea || d.bounds;
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x);
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y);
    return w >= need && h >= need;
  });
}

/** Opciones para BrowserWindow: lo guardado si es válido, si no el tamaño por defecto. */
function restore(saved, displays) {
  const s = sanitize(saved);
  if (!s) return { ...DEFAULT, maximized: false };
  if (isNum(s.x) && !visible(s, displays)) {
    return { width: s.width, height: s.height, maximized: s.maximized }; // sin posición: el sistema la centra
  }
  return s;
}

module.exports = { DEFAULT, MIN, sanitize, visible, restore };
