// Preferencias de apariencia: valores permitidos y valores por defecto.
// Se validan en el proceso principal para que un settings.json editado a mano no rompa la app.
const THEMES = ['system', 'light', 'dark'];
const ACCENTS = ['azul', 'verde', 'violeta', 'coral', 'ambar', 'grafito'];
const FONTS = ['serif', 'sans', 'mono'];
const WIDTHS = ['narrow', 'normal', 'wide'];
const LANGUAGES = ['system', 'es', 'en'];
const SIZES = [15, 17, 19, 21];

const DEFAULTS = { theme: 'system', accent: 'azul', font: 'serif', size: 17, width: 'normal', language: 'system' };

const RULES = {
  theme: (v) => THEMES.includes(v),
  accent: (v) => ACCENTS.includes(v),
  font: (v) => FONTS.includes(v),
  width: (v) => WIDTHS.includes(v),
  language: (v) => LANGUAGES.includes(v),
  size: (v) => SIZES.includes(v),
};

/** Deja solo los campos conocidos con un valor permitido. */
function sanitize(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [key, ok] of Object.entries(RULES)) {
    if (key in patch && ok(patch[key])) out[key] = patch[key];
  }
  return out;
}

const withDefaults = (stored) => ({ ...DEFAULTS, ...sanitize(stored) });

module.exports = { DEFAULTS, THEMES, ACCENTS, FONTS, WIDTHS, LANGUAGES, SIZES, sanitize, withDefaults };
