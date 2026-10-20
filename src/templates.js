// Plantillas de fábrica. Se escriben en el idioma de la interfaz; las propias de la persona viven en la bóveda (templates/*.json).
import { esc, dayDate } from './ui.js';
import { t } from './i18n.js';

const task = (text) => `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${esc(text)}</p></div></li>`;
const tasks = (items) => `<ul data-type="taskList">${items.map(task).join('')}</ul>`;

export function builtinTemplates() {
  return [
    {
      id: 'builtin-meeting',
      name: t('tpl.meeting.name'),
      html: `<h1>${esc(t('tpl.meeting.title'))}</h1>
<h2>${esc(t('tpl.meeting.when'))}</h2><p></p>
<h2>${esc(t('tpl.meeting.topics'))}</h2><ul><li><p></p></li></ul>
<h2>${esc(t('tpl.meeting.agreements'))}</h2><ul><li><p></p></li></ul>
<h2>${esc(t('tpl.meeting.todo'))}</h2>${tasks([t('tpl.meeting.todo1')])}`,
    },
    {
      id: 'builtin-journal',
      name: t('tpl.journal.name'),
      html: `<h1>${esc(dayDate(Date.now()))}</h1>
<h2>${esc(t('tpl.journal.good'))}</h2><p></p>
<h2>${esc(t('tpl.journal.hard'))}</h2><p></p>
<h2>${esc(t('tpl.journal.tomorrow'))}</h2>${tasks([''])}`,
    },
    {
      id: 'builtin-shopping',
      name: t('tpl.shopping.name'),
      html: `<h1>${esc(t('tpl.shopping.name'))}</h1>${tasks([t('tpl.shopping.a'), t('tpl.shopping.b'), t('tpl.shopping.c')])}`,
    },
  ];
}
