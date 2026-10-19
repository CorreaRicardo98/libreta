import { Node } from '@tiptap/core';

const api = window.libreta;

export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Archivo adjunto de cualquier tipo: una tarjeta que se abre con el programa predeterminado. */
export const Attachment = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '', parseHTML: (el) => el.getAttribute('data-src') },
      name: { default: 'archivo', parseHTML: (el) => el.getAttribute('data-name') },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size')) || 0 },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="attachment"]' }]; },

  renderHTML({ node }) {
    const { src, name, size } = node.attrs;
    return ['div', { 'data-type': 'attachment', 'data-src': src, 'data-name': name, 'data-size': size }, `📎 ${name} (${humanSize(size)})`];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'att-card';
      dom.contentEditable = 'false';
      const ext = (node.attrs.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      dom.innerHTML = `<span class="att-ext"></span><span class="att-info"><b></b><small></small></span><button type="button" class="att-open">Abrir</button>`;
      dom.querySelector('.att-ext').textContent = ext || 'ARCH';
      dom.querySelector('b').textContent = node.attrs.name;
      dom.querySelector('small').textContent = humanSize(node.attrs.size);
      const open = () => api.openAttachment(node.attrs.src);
      dom.querySelector('.att-open').addEventListener('click', open);
      dom.addEventListener('dblclick', open);
      return { dom };
    };
  },
});
