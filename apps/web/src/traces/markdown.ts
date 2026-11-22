import MarkdownIt from 'markdown-it';

/** A trace body is markdown. This is its structured form, as the editor and renderer use it. */
export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};

type Token = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number];

const IMAGE_SCHEME = 'trace-image:';
export const PENDING_SCHEME = 'pending-image:';
const STORED_IMAGE = /^trace-image:[0-9a-f-]{36}$/i;
const SAFE_LINK = /^(https?:|mailto:)/i;
const NBSP = ' ';

export const imageSrc = (id: string) => `${IMAGE_SCHEME}${id}`;
export const imageIdFrom = (src: unknown): string | null =>
  typeof src === 'string' && STORED_IMAGE.test(src) ? src.slice(IMAGE_SCHEME.length) : null;
export const isSafeLink = (href: unknown): boolean =>
  typeof href === 'string' && SAFE_LINK.test(href.trim());

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
// Indentation is how verse is laid out, so it must never turn a poem into a code block.
md.disable('code');
md.validateLink = (url) => isSafeLink(url) || STORED_IMAGE.test(url.trim());

const LIST_LINE = /^\s*(?:[-+*]|\d+[.)])\s/;
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

/** Protects the leading spaces of verse, which markdown would otherwise strip. */
function keepVerseIndent(source: string): string {
  let fence: string | null = null;
  let inList = false;
  let afterBlank = true;
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const marker = FENCE_LINE.exec(line)?.[1];
      if (fence) {
        if (marker?.startsWith(fence)) fence = null;
        return line;
      }
      if (marker) {
        fence = marker;
        return line;
      }
      if (!line.trim()) {
        afterBlank = true;
        return line;
      }
      const wasAfterBlank = afterBlank;
      afterBlank = false;
      if (LIST_LINE.test(line)) {
        inList = true;
        return line;
      }
      const indented = /^[ \t]/.test(line);
      if (inList && (indented || !wasAfterBlank)) return line;
      inList = false;
      if (!indented || /^\s*>/.test(line)) return line;
      return line.replace(/^[ \t]+/, (space) => NBSP.repeat(space.replace(/\t/g, '    ').length));
    })
    .join('\n');
}

const MARK_FOR: Record<string, string> = { strong: 'bold', em: 'italic', s: 'strike' };

function inlineNodes(tokens: Token[]): DocNode[] {
  const nodes: DocNode[] = [];
  let marks: DocMark[] = [];
  const pushText = (text: string, extra: DocMark[] = []) => {
    if (!text) return;
    const all = [...marks, ...extra];
    nodes.push({ type: 'text', text, ...(all.length ? { marks: all } : {}) });
  };

  for (const token of tokens) {
    const base = token.type.replace(/_(open|close)$/, '');
    if (token.type === 'text') pushText(token.content);
    else if (token.type === 'code_inline') {
      const link = marks.filter((mark) => mark.type === 'link');
      nodes.push({ type: 'text', text: token.content, marks: [...link, { type: 'code' }] });
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      nodes.push({ type: 'hardBreak' });
    } else if (token.type === 'image') {
      const src = String(token.attrGet('src') ?? '');
      const alt = token.content;
      // Only the writer's own stored images load: a remote one would reveal that they read this.
      if (STORED_IMAGE.test(src)) nodes.push({ type: 'image', attrs: { src, alt, title: null } });
      else if (isSafeLink(src)) pushText(alt || src, [{ type: 'link', attrs: { href: src } }]);
      else pushText(alt);
    } else if (token.type === 'link_open') {
      marks = [...marks, { type: 'link', attrs: { href: token.attrGet('href') } }];
    } else if (token.type === 'link_close') {
      marks = marks.filter((mark) => mark.type !== 'link');
    } else if (MARK_FOR[base]) {
      const type = MARK_FOR[base]!;
      marks = token.nesting > 0 ? [...marks, { type }] : marks.filter((mark) => mark.type !== type);
    }
  }
  return nodes;
}

const trimBreaks = (nodes: DocNode[]) => {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start]!.type === 'hardBreak') start += 1;
  while (end > start && nodes[end - 1]!.type === 'hardBreak') end -= 1;
  return nodes.slice(start, end);
};

/** Images are blocks in the editor, so a line holding one splits around it. */
function splitAroundImages(block: DocNode, inline: DocNode[]): DocNode[] {
  if (!inline.some((node) => node.type === 'image')) {
    return [inline.length ? { ...block, content: inline } : block];
  }
  const out: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    const content = trimBreaks(run);
    if (content.length) out.push({ ...block, content });
    run = [];
  };
  for (const node of inline) {
    if (node.type === 'image') {
      flush();
      out.push(node);
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

export function parseBody(body: string): DocNode {
  const root: DocNode = { type: 'doc', content: [] };
  const stack: DocNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  const open = (node: DocNode) => {
    (top().content ??= []).push(node);
    stack.push(node);
  };

  for (const token of md.parse(keepVerseIndent(body), {})) {
    switch (token.type) {
      case 'paragraph_open':
        open({ type: 'paragraph' });
        break;
      case 'heading_open':
        open({ type: 'heading', attrs: { level: Math.min(Number(token.tag.slice(1)), 3) } });
        break;
      case 'bullet_list_open':
        open({ type: 'bulletList', content: [] });
        break;
      case 'ordered_list_open':
        open({ type: 'orderedList', attrs: { start: Number(token.attrGet('start') ?? 1) }, content: [] });
        break;
      case 'list_item_open':
        open({ type: 'listItem', content: [] });
        break;
      case 'blockquote_open':
        open({ type: 'blockquote', content: [] });
        break;
      case 'list_item_close': {
        const item = stack.pop()!;
        // The editor's schema requires a list item to start with a paragraph.
        if (item.content?.[0]?.type !== 'paragraph') item.content = [{ type: 'paragraph' }, ...(item.content ?? [])];
        break;
      }
      case 'paragraph_close':
      case 'heading_close':
      case 'bullet_list_close':
      case 'ordered_list_close':
      case 'blockquote_close':
        stack.pop();
        break;
      case 'inline': {
        const block = stack.pop()!;
        const parent = top();
        parent.content!.pop();
        const parts = splitAroundImages(block, inlineNodes(token.children ?? []));
        parent.content!.push(...parts);
        // The matching close token pops this placeholder.
        stack.push(parts.at(-1) ?? block);
        break;
      }
      case 'hr':
        (top().content ??= []).push({ type: 'horizontalRule' });
        break;
      case 'fence': {
        const text = token.content.replace(/\n$/, '');
        (top().content ??= []).push({
          type: 'codeBlock',
          attrs: { language: token.info.trim() || null },
          ...(text ? { content: [{ type: 'text', text }] } : {}),
        });
        break;
      }
    }
  }
  if (!root.content!.length) root.content = [{ type: 'paragraph' }];
  return root;
}

const escapeText = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/[*`[\]~]/g, '\\$&')
    .replace(/&(?=#?\w+;)/g, '\\&')
    .replace(/(^|[^\p{L}\p{N}])_/gu, '$1\\_')
    .replace(/_(?=$|[^\p{L}\p{N}])/gu, '\\_');

const escapeLineStart = (line: string) =>
  line
    .replace(/^([  ]*)(#{1,6}(?=\s|$)|>|[-+](?=\s|$)|=+\s*$|-{3,}\s*$)/, '$1\\$2')
    .replace(/^([  ]*\d+)([.)])(?=\s|$)/, '$1\\$2');

const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'];
const DELIMITER: Record<string, string> = { bold: '**', italic: '*', strike: '~~' };

const sortedMarks = (marks: DocMark[] = []) =>
  [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
const sameMark = (a: DocMark, b: DocMark) => a.type === b.type && a.attrs?.href === b.attrs?.href;
const linkTarget = (href: unknown) => String(href).replace(/[()\s]/g, encodeURIComponent);

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

function serializeInline(nodes: DocNode[] = []): string {
  let out = '';
  let open: DocMark[] = [];

  const moveTo = (wanted: DocMark[]) => {
    let shared = 0;
    while (shared < open.length && shared < wanted.length && sameMark(open[shared]!, wanted[shared]!)) {
      shared += 1;
    }
    for (const mark of open.slice(shared).reverse()) {
      if (mark.type === 'link') out += `](${linkTarget(mark.attrs?.href)})`;
      else out += DELIMITER[mark.type] ?? '';
    }
    for (const mark of wanted.slice(shared)) {
      if (mark.type === 'link') out += '[';
      else out += DELIMITER[mark.type] ?? '';
    }
    open = wanted;
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      moveTo([]);
      out += '\n';
      continue;
    }
    if (node.type !== 'text' || !node.text) continue;
    const marks = sortedMarks(node.marks).filter((mark) => mark.type !== 'link' || isSafeLink(mark.attrs?.href));
    const link = marks.find((mark) => mark.type === 'link');
    if (marks.length === 1 && link && link.attrs?.href === node.text && /^https?:/i.test(node.text)) {
      moveTo([]);
      out += node.text;
      continue;
    }
    if (marks.some((mark) => mark.type === 'code')) {
      moveTo(marks.filter((mark) => mark.type !== 'code'));
      out += codeSpan(node.text);
      continue;
    }
    // Emphasis cannot open or close against a space, so spaces stay outside it.
    const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text) ?? [];
    const outer = marks.filter((mark) => mark.type === 'link');
    if (lead) {
      moveTo(outer);
      out += lead;
    }
    if (core) {
      moveTo(marks);
      out += escapeText(core);
    }
    if (trail) {
      moveTo(outer);
      out += trail;
    }
  }
  moveTo([]);
  return out;
}

const indent = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((line, index) => (index === 0 ? line : line ? `${' '.repeat(prefix.length)}${line}` : line))
    .join('\n');

function serializeBlock(node: DocNode, topLevel: boolean): string {
  switch (node.type) {
    case 'paragraph': {
      const text = serializeInline(node.content).split('\n').map(escapeLineStart).join('\n');
      return topLevel ? text.replace(/^ +/gm, (space) => ' '.repeat(space.length)) : text;
    }
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${serializeInline(node.content).replace(/\n/g, ' ')}`;
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `- ${indent(serializeItem(item), '- ')}`)
        .join('\n');
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, index) => {
          const marker = `${start + index}. `;
          return `${marker}${indent(serializeItem(item), marker)}`;
        })
        .join('\n');
    }
    case 'blockquote':
      return serializeBlocks(node.content)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'horizontalRule':
      return '---';
    case 'codeBlock': {
      const text = (node.content ?? []).map((child) => child.text ?? '').join('');
      const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${node.attrs?.language ?? ''}\n${text}\n${fence}`;
    }
    case 'image': {
      const alt = String(node.attrs?.alt ?? '').replace(/[\\[\]]/g, '\\$&').replace(/\s+/g, ' ');
      return `![${alt}](${String(node.attrs?.src ?? '')})`;
    }
    default:
      return '';
  }
}

/** A nested list sits directly under its item, so the outer list stays tight. */
function serializeItem(item: DocNode): string {
  let out = '';
  for (const child of item.content ?? []) {
    const text = serializeBlock(child, false);
    if (!text.trim()) continue;
    if (out) out += child.type === 'bulletList' || child.type === 'orderedList' ? '\n' : '\n\n';
    out += text;
  }
  return out;
}

function serializeBlocks(nodes: DocNode[] = [], topLevel = false): string {
  return nodes
    .map((node) => serializeBlock(node, topLevel))
    .filter((text) => text.trim() !== '')
    .join('\n\n');
}

export const serializeBody = (doc: DocNode) => serializeBlocks(doc.content, true);

/** Every stored image a body embeds, in order. */
export function embeddedImageIds(body: string): string[] {
  const ids: string[] = [];
  const visit = (node: DocNode) => {
    if (node.type === 'image') {
      const id = imageIdFrom(node.attrs?.src);
      if (id) ids.push(id);
    }
    node.content?.forEach(visit);
  };
  visit(parseBody(body));
  return ids;
}

/** The readable words of a body, on one line, for names and search. */
export function plainText(body: string): string {
  const words: string[] = [];
  const visit = (node: DocNode) => {
    if (node.text) words.push(node.text);
    if (node.type === 'hardBreak') words.push(' ');
    node.content?.forEach(visit);
    if (node.type !== 'text' && node.type !== 'hardBreak') words.push(' ');
  };
  visit(parseBody(body));
  return words.join('').replace(/\s+/g, ' ').trim();
}

/** Local previews cannot outlive the page, so a saved draft leaves them out. */
export const withoutPendingImages = (body: string) =>
  body
    .replace(/!\[(?:\\.|[^\]\\])*\]\(pending-image:[^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const replacePendingImage = (body: string, key: string, id: string | null) =>
  body.replace(
    new RegExp(`!\\[((?:\\\\.|[^\\]\\\\])*)\\]\\(${PENDING_SCHEME}${key}\\)`),
    (_match, alt: string) => (id ? `![${alt}](${imageSrc(id)})` : ''),
  );
