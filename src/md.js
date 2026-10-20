// HTML del editor -> Markdown (para compartir y exportar).
export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return (
    block(doc.body)
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

const kids = (el, fn) => [...el.childNodes].map(fn).join('');

function inline(n) {
  if (n.nodeType === 3) return n.textContent.replace(/([*_`\\])/g, '\\$1');
  if (n.nodeType !== 1) return '';
  const t = n.tagName.toLowerCase();
  const inner = () => kids(n, inline);
  switch (t) {
    case 'strong':
    case 'b':
      return `**${inner()}**`;
    case 'em':
    case 'i':
      return `*${inner()}*`;
    case 's':
    case 'del':
      return `~~${inner()}~~`;
    case 'u':
      return `<u>${inner()}</u>`;
    case 'mark':
      return `==${inner()}==`;
    case 'code':
      return `\`${n.textContent}\``;
    case 'a':
      return n.hasAttribute('data-note-link') ? `[[${n.textContent}]]` : `[${inner()}](${n.getAttribute('href') || ''})`;
    case 'br':
      return '  \n';
    case 'img':
      return `![${n.getAttribute('alt') || ''}](${n.getAttribute('src') || ''})`;
    default:
      return inner();
  }
}

function list(el, ordered, depth) {
  const pad = '  '.repeat(depth);
  let i = 0;
  return [...el.children]
    .map((li) => {
      i++;
      const task = li.getAttribute('data-type') === 'taskItem';
      const mark = task ? (li.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] ') : ordered ? `${i}. ` : '- ';
      let first = '';
      let nested = '';
      for (const c of li.children) {
        const t = c.tagName.toLowerCase();
        if (t === 'ul' || t === 'ol') nested += list(c, t === 'ol', depth + 1);
        else if (t === 'div' || t === 'label') {
          if (t === 'label') continue;
          for (const d of c.children) {
            const dt = d.tagName.toLowerCase();
            if (dt === 'ul' || dt === 'ol') nested += list(d, dt === 'ol', depth + 1);
            else first += (first ? ' ' : '') + kids(d, inline);
          }
        } else first += (first ? ' ' : '') + kids(c, inline);
      }
      return `${pad}${mark}${first.trim()}\n${nested}`;
    })
    .join('');
}

function table(el) {
  const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => kids(c, inline).replace(/\|/g, '\\|').trim()));
  if (!rows.length) return '';
  const head = rows[0];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)];
  return lines.join('\n') + '\n\n';
}

function block(el) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) out += `${inline(n)}\n\n`;
      continue;
    }
    if (n.nodeType !== 1) continue;
    const t = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t)) out += `${'#'.repeat(Number(t[1]))} ${kids(n, inline)}\n\n`;
    else if (t === 'p') out += `${kids(n, inline)}\n\n`;
    else if (t === 'ul' || t === 'ol') out += `${list(n, t === 'ol', 0)}\n`;
    else if (t === 'blockquote')
      out +=
        block(n)
          .trim()
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n') + '\n\n';
    else if (t === 'pre') out += `\`\`\`\n${n.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
    else if (t === 'hr') out += '---\n\n';
    else if (t === 'table') out += table(n);
    else if (t === 'img') out += `${inline(n)}\n\n`;
    else if (t === 'div' && n.getAttribute('data-type') === 'attachment') out += `[📎 ${n.getAttribute('data-name')}](${n.getAttribute('data-src')})\n\n`;
    else out += block(n);
  }
  return out;
}
