// Textos del proceso principal (menú, diálogos del sistema, exportación). Usa los mismos archivos que la interfaz.
const dicts = { es: require('../src/locales/es.json'), en: require('../src/locales/en.json') };

/** Devuelve una función t(clave, variables) para el idioma indicado. */
function translator(lang) {
  const dict = dicts[lang] || dicts.en;
  return (key, vars) => {
    const s = dict[key] ?? dicts.es[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  };
}

/** Idioma efectivo: el elegido o, si es «system», el del sistema (español si empieza por «es», si no inglés). */
function resolveLang(choice, systemLocale) {
  if (choice === 'es' || choice === 'en') return choice;
  return String(systemLocale || '')
    .toLowerCase()
    .startsWith('es')
    ? 'es'
    : 'en';
}

module.exports = { translator, resolveLang, LANGS: Object.keys(dicts) };
