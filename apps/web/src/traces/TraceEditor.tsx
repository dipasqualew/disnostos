import { Extension, type Editor, type Range } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { TextSelection } from '@tiptap/pm/state';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import {
  Heading1,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Minus,
  Quote,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { TracesApi } from './api';
import {
  imageIdFrom,
  imageSrc,
  isSafeLink,
  parseBody,
  PENDING_SCHEME,
  serializeBody,
  type DocNode,
} from './markdown';
import { AuthedImage, IMAGE_TYPES } from './TraceImages';

export type Preview = { url: string; file: File };
export type Previews = Map<string, Preview>;

type EmbedOptions = { api: TracesApi | null; traceId: string | null; previews: Previews };

function EmbeddedImage({ node, extension, selected, deleteNode }: ReactNodeViewProps) {
  const { api, traceId, previews } = extension.options as EmbedOptions;
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  const id = imageIdFrom(src);
  const preview = src.startsWith(PENDING_SCHEME) ? previews.get(src.slice(PENDING_SCHEME.length)) : undefined;

  return (
    <NodeViewWrapper className={`embed${selected ? ' is-selected' : ''}`} data-drag-handle="">
      {preview && <img src={preview.url} alt={alt} />}
      {id && api && traceId && <AuthedImage api={api} traceId={traceId} imageId={id} alt={alt} />}
      <button
        type="button"
        className="icon-button embed-remove"
        contentEditable={false}
        aria-label={`Remove image ${alt}`}
        onClick={() => deleteNode()}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </NodeViewWrapper>
  );
}

const EmbedImage = Image.extend<ReturnType<NonNullable<typeof Image.config.addOptions>> & EmbedOptions>({
  addOptions() {
    return { ...this.parent!(), api: null, traceId: null, previews: new Map() };
  },
  // Pasted web content must not bring remote images, which would load from third parties.
  parseHTML: () => [{ tag: 'img[src^="trace-image:"]' }, { tag: 'img[src^="pending-image:"]' }],
  addNodeView() {
    return ReactNodeViewRenderer(EmbeddedImage);
  },
});

type SlashItem = { label: string; hint: string; icon: LucideIcon; run(editor: Editor): void };

const blockItems: SlashItem[] = [
  { label: 'Heading', hint: 'Large section title', icon: Heading1, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Subheading', hint: 'Smaller title', icon: Heading2, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Bulleted list', hint: 'A simple list', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', hint: 'An ordered list', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Quote', hint: 'Set a passage apart', icon: Quote, run: (e) => e.chain().focus().setBlockquote().run() },
  { label: 'Divider', hint: 'A line between parts', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
];

type Menu = { items: SlashItem[]; index: number; rect: DOMRect | null; choose(item: SlashItem): void };

/** A visible way to add images, for devices where pasting and dropping are not practical. */
export function ImageButton({ onFiles }: { onFiles(files: File[]): void }) {
  return (
    <label className="chip image-button" title="Add image">
      <input
        className="sr-only"
        type="file"
        aria-label="Add image"
        accept={IMAGE_TYPES.join(',')}
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <ImagePlus size={14} aria-hidden="true" /> Image
    </label>
  );
}

export type RichEditorHandle = {
  focus(): void;
  clear(): void;
  markdown(): string;
  insertPending(key: string, alt: string): void;
  resolvePending(key: string, id: string | null): void;
};

type Props = {
  ref?: Ref<RichEditorHandle>;
  label: string;
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  api: TracesApi;
  traceId: string | null;
  previews: Previews;
  onChange(markdown: string): void;
  onSubmit?(): void;
  onFiles(files: File[]): void;
};

export function RichEditor({
  ref,
  label,
  placeholder,
  initial = '',
  autoFocus = false,
  api,
  traceId,
  previews,
  onChange,
  onSubmit,
  onFiles,
}: Props) {
  const latest = useRef({ onChange, onSubmit, onFiles });
  latest.current = { onChange, onSubmit, onFiles };
  const picker = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuRef = useRef<Menu | null>(null);
  menuRef.current = menu;

  const imageFiles = (list: FileList | null | undefined) =>
    [...(list ?? [])].filter((file) => file.type.startsWith('image/'));

  const editor = useEditor({
    autofocus: autoFocus ? 'end' : false,
    content: parseBody(initial),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          isAllowedUri: (url) => isSafeLink(url),
          shouldAutoLink: (url) => /^https?:/i.test(url),
        },
      }),
      EmbedImage.configure({ api, traceId, previews }),
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: 'traceKeys',
        addKeyboardShortcuts() {
          return {
            'Mod-Enter': () => {
              latest.current.onSubmit?.();
              return true;
            },
            Escape: () => {
              if (menuRef.current) return false;
              this.editor.commands.blur();
              return true;
            },
          };
        },
      }),
      Extension.create({
        name: 'slashMenu',
        addProseMirrorPlugins() {
          return [
            Suggestion<SlashItem, SlashItem>({
              editor: this.editor,
              char: '/',
              items: ({ query }) => {
                const image: SlashItem = {
                  label: 'Image',
                  hint: 'Upload from your device',
                  icon: ImagePlus,
                  run: () => picker.current?.click(),
                };
                const needle = query.toLowerCase();
                return [...blockItems, image].filter((item) => item.label.toLowerCase().includes(needle));
              },
              command: ({ editor: target, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
                target.chain().focus().deleteRange(range).run();
                props.run(target);
              },
              render: () => {
                const show = (props: SuggestionProps<SlashItem, SlashItem>) =>
                  setMenu((current) => ({
                    items: props.items,
                    index: Math.min(current?.index ?? 0, Math.max(props.items.length - 1, 0)),
                    rect: props.clientRect?.() ?? null,
                    choose: (item) => props.command(item),
                  }));
                return {
                  onStart: show,
                  onUpdate: show,
                  onExit: () => setMenu(null),
                  onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                    const current = menuRef.current;
                    if (!current || current.items.length === 0) return false;
                    const size = current.items.length;
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      const step = event.key === 'ArrowDown' ? 1 : -1;
                      setMenu({ ...current, index: (current.index + step + size) % size });
                      return true;
                    }
                    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                      current.choose(current.items[current.index]!);
                      return true;
                    }
                    if (event.key === 'Escape') {
                      setMenu(null);
                      return true;
                    }
                    return false;
                  },
                };
              },
            }),
          ];
        },
      }),
    ],
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'content editor-surface' },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        latest.current.onFiles(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
        latest.current.onFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => latest.current.onChange(serializeBody(current.getJSON() as DocNode)),
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus('end'),
      clear: () => {
        editor?.commands.clearContent(false);
        editor?.commands.focus();
      },
      markdown: () => (editor ? serializeBody(editor.getJSON() as DocNode) : ''),
      insertPending: (key, alt) => {
        editor
          ?.chain()
          .focus()
          .insertContent({ type: 'image', attrs: { src: `${PENDING_SCHEME}${key}`, alt, title: null } })
          .run();
      },
      resolvePending: (key, id) => {
        if (!editor) return;
        const src = `${PENDING_SCHEME}${key}`;
        let found: { pos: number; size: number; attrs: Record<string, unknown> } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === src) {
            found = { pos, size: node.nodeSize, attrs: node.attrs };
          }
          return !found;
        });
        if (!found) return;
        const { pos, size, attrs } = found as { pos: number; size: number; attrs: Record<string, unknown> };
        const tr = id
          ? editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, src: imageSrc(id) })
          : editor.state.tr.delete(pos, pos + size);
        editor.view.dispatch(tr.setMeta('addToHistory', false));
      },
    }),
    [editor],
  );

  useEffect(() => () => setMenu(null), []);

  return (
    <div className="rich-editor">
      <EditorContent editor={editor} />
      <input
        ref={picker}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={IMAGE_TYPES.join(',')}
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length) latest.current.onFiles(files);
        }}
      />
      {menu && menu.items.length > 0 && (
        <ul
          className="slash-menu"
          role="listbox"
          aria-label="Insert a block"
          style={menu.rect ? { top: menu.rect.bottom + 6, left: Math.max(8, Math.min(menu.rect.left, window.innerWidth - 248)) } : undefined}
        >
          {menu.items.map((item, index) => (
            <li key={item.label} role="option" aria-selected={index === menu.index}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => {
                  event.preventDefault();
                  menu.choose(item);
                }}
              >
                <item.icon size={16} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
