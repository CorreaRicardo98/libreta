import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Attachment } from './attachment.js';
import { NoteLink } from './notelink.js';

const api = window.libreta;

export async function saveImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return api.attach(file.name || 'imagen.png', bytes);
}

const droppedFiles = (dt) => [...(dt?.files || [])];

/** Inserta archivos: las imágenes se muestran, el resto queda como tarjeta de adjunto. */
export async function insertFiles(ed, files, pos, { focus = true } = {}) {
  for (const f of files) {
    const src = await saveImageFile(f);
    const node = f.type.startsWith('image/')
      ? { type: 'image', attrs: { src, alt: f.name } }
      : { type: 'attachment', attrs: { src, name: f.name, size: f.size } };
    const chain = focus ? ed.chain().focus() : ed.chain();
    (pos != null ? chain.insertContentAt(pos, node) : chain.insertContent(node)).run();
  }
}

/**
 * Al escribir «[[» aparece una lista de notas para enlazar.
 * links: { getTitle(id), onOpen(id), suggest(texto) -> [{id,title}], create(titulo) -> Promise<id> }
 */
function wikiSuggest(links) {
  let pop = null;
  let items = [];
  let active = 0;
  let range = null;
  let editorRef = null;

  const close = () => { pop?.remove(); pop = null; items = []; range = null; };
  const apply = async (it) => {
    const ed = editorRef;
    if (!ed || !range) return;
    const { from, to, query } = range;
    close();
    const id = it.create ? await links.create(query.trim()) : it.id;
    const label = it.create ? query.trim() : it.title;
    ed.chain().focus().deleteRange({ from, to })
      .insertContent([{ type: 'noteLink', attrs: { id, label } }, { type: 'text', text: ' ' }]).run();
  };
  const draw = (coords) => {
    if (!pop) { pop = document.createElement('div'); pop.className = 'menu wiki-pop'; pop.setAttribute('role', 'listbox'); document.body.append(pop); }
    pop.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === active));
      b.textContent = it.create ? `Crear nota «${range.query.trim()}»` : it.title || 'Nota sin título';
      if (it.create) b.className = 'wiki-create';
      b.addEventListener('mousedown', (e) => { e.preventDefault(); apply(it); });
      pop.append(b);
    });
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(coords.left, innerWidth - r.width - 8))}px`;
    pop.style.top = `${coords.bottom + r.height + 12 > innerHeight ? coords.top - r.height - 6 : coords.bottom + 6}px`;
  };

  return {
    update(ed) {
      editorRef = ed;
      const { selection } = ed.state;
      if (!selection.empty) return close();
      const $from = selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const m = /\[\[([^\[\]\n]{0,60})$/.exec(before);
      if (!m) return close();
      const query = m[1];
      range = { from: selection.from - m[0].length, to: selection.from, query };
      items = links.suggest(query).slice(0, 6);
      if (query.trim()) items.push({ create: true });
      if (!items.length) return close();
      active = Math.min(active, items.length - 1);
      draw(ed.view.coordsAtPos(selection.from));
    },
    key(event) {
      if (!pop) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        pop.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === active)));
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') { apply(items[active]); return true; }
      if (event.key === 'Escape') { close(); return true; }
      return false;
    },
    close,
  };
}

export function createEditor({ element, onUpdate, onSelection, onLink, links }) {
  const wiki = links ? wikiSuggest(links) : null;
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      Placeholder.configure({ placeholder: 'Escribe el título aquí…' }),
      Highlight,
      Image,
      Attachment,
      NoteLink.configure({ getTitle: links?.getTitle || (() => null), onOpen: links?.onOpen || (() => {}) }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': 'Contenido de la nota', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste(_view, event) {
        const files = droppedFiles(event.clipboardData);
        if (!files.length) return false;
        insertFiles(editor, files);
        return true;
      },
      handleDrop(view, event) {
        const files = droppedFiles(event.dataTransfer);
        if (!files.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFiles(editor, files, pos);
        return true;
      },
      handleClick(_view, _pos, event) {
        const a = event.target.closest?.('a[href]');
        if (a && (event.ctrlKey || event.metaKey)) { window.open(a.href, '_blank'); return true; }
        return false;
      },
      handleKeyDown(_view, event) {
        if (wiki?.key(event)) { event.preventDefault(); return true; }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          onLink?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => onUpdate?.(),
    onSelectionUpdate: () => onSelection?.(),
    onTransaction: ({ editor: ed }) => { onSelection?.(); wiki?.update(ed); },
    onBlur: () => wiki?.close(),
  });
  return editor;
}

const TAG_RE = /(?:^|\s)#(\p{L}[\p{L}\p{N}_-]{0,39})/gu;

/** Todo lo que la lista y el buscador necesitan saber de una nota. */
export function snapshot(editor) {
  const text = editor.getText({ blockSeparator: '\n' });
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const html = editor.getHTML();
  const tags = [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1].toLowerCase()))];
  const img = html.match(/<img[^>]+src="([^"]+)"/);
  return {
    title: (lines[0] || '').slice(0, 120),
    preview: lines.slice(1).join(' ').slice(0, 160),
    thumb: img ? img[1] : '',
    html, text, tags,
  };
}

export function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
