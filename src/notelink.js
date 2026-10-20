import { Node } from '@tiptap/core';
import { t } from './i18n.js';

/** Enlace a otra nota: se escribe con [[ y siempre muestra el título actual de la nota enlazada. */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { getTitle: () => null, onOpen: () => {} };
  },

  addAttributes() {
    return {
      id: { default: '', parseHTML: (el) => el.getAttribute('data-note-link') },
      label: { default: '', parseHTML: (el) => el.textContent },
    };
  },

  parseHTML() { return [{ tag: 'a[data-note-link]' }]; },

  renderHTML({ node }) {
    return ['a', { 'data-note-link': node.attrs.id, href: '#', class: 'note-link' }, node.attrs.label];
  },

  renderText({ node }) { return `[[${node.attrs.label}]]`; },

  addNodeView() {
    const { getTitle, onOpen } = this.options;
    return ({ node }) => {
      const dom = document.createElement('a');
      const live = getTitle(node.attrs.id);
      dom.className = `note-link${live == null ? ' missing' : ''}`;
      dom.setAttribute('href', '#');
      dom.setAttribute('role', 'link');
      dom.contentEditable = 'false';
      dom.textContent = live || node.attrs.label || t('share.defaultTitle');
      dom.title = live == null ? t('link.missing') : t('link.open');
      dom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onOpen(node.attrs.id); });
      return { dom };
    };
  },
});
