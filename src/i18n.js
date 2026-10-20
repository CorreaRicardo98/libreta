// Idiomas de la interfaz. Los textos viven en src/locales/<idioma>.json (claves planas).
// Las variables se escriben {nombre}; los plurales usan claves «.one» y «.other» (ver tn()).
import es from './locales/es.json';
import en from './locales/en.json';

const DICTS = { es, en };
const LOCALES = { es: 'es-MX', en: 'en-US' };
let lang = 'es';

export function setLang(l) {
  lang = DICTS[l] ? l : 'en';
  document.documentElement.lang = lang;
}
export const getLang = () => lang;
/** Etiqueta BCP 47 para Intl y comparaciones de texto. */
export const locale = () => LOCALES[lang];

/** Si falta una clave en el idioma actual se usa el español, y si tampoco existe, la propia clave. */
export function t(key, vars) {
  const s = DICTS[lang][key] ?? es[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/** Plural: busca «clave.one» cuando n es 1 y «clave.other» en los demás casos. {n} está disponible. */
export const tn = (key, n, vars) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });

/**
 * Traduce el HTML estático. Atributos:
 *   data-i18n="clave"          -> texto del elemento
 *   data-i18n-title="clave"    -> title      data-i18n-label="clave" -> aria-label
 *   data-i18n-ph="clave"       -> placeholder
 */
export function translateDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  document.title = t('app.title');
}
