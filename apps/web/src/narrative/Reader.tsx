import { CornerDownLeft, GripVertical, Plus } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useRouter } from '../router';
import { clearDraft, loadDraft, saveDraft } from '../traces/drafts';
import type { FullVersion, MythFull, PoolBeat } from './api';
import { useAutosize } from './controls';
import { currentLanguage, deriveLabel, isLanguageTag, paragraphs, type Passage } from './model';
import type { MythStore } from './useMyth';

/** Where a row lands when moved one place up or down, or undefined at either end. */
export function afterIdForMove(rows: { id: string }[], id: string, delta: -1 | 1): string | null | undefined {
  const index = rows.findIndex((row) => row.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length) return undefined;
  if (delta === 1) return rows[target]!.id;
  return target === 0 ? null : rows[target - 1]!.id;
}

const hasFinePointer = () => window.matchMedia?.('(pointer: fine)').matches ?? false;

export function Prose({ text, language }: { text: string; language?: string }) {
  return (
    <div lang={language}>
      {paragraphs(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function PassageEditor({
  label,
  initial,
  onSave,
  onCancel,
}: {
  label: string;
  initial: string;
  onSave(text: string): void;
  onCancel(): void;
}) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  useAutosize(area, text);
  useEffect(() => {
    area.current?.focus();
  }, []);

  function save() {
    const next = text.trim();
    if (next && next !== initial) onSave(next);
    else onCancel();
  }

  return (
    <div className="passage-editor">
      <textarea
        ref={area}
        aria-label={`Wording of ${label}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
          }
        }}
      />
      <div className="editor-actions">
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="post-button" onClick={save}>Save wording</button>
      </div>
    </div>
  );
}

type ComposerProps = {
  store: MythStore;
  version: FullVersion;
  language: string;
  omitted: PoolBeat[];
  afterId: string | null | undefined;
  afterLabel: string | null;
  autoFocus: boolean;
  onDone(): void;
};

/** The main way to write: type a passage, press Enter, keep going. */
function PassageComposer({ store, version, language, omitted, afterId, afterLabel, autoFocus, onDone }: ComposerProps) {
  const { user } = useAuth();
  const { setHeld } = useRouter();
  const uid = user?.uid ?? '';
  const draftKey = `passage:${version.id}`;
  const [draft] = useState(() => loadDraft(uid, draftKey));
  const [text, setText] = useState(draft?.body ?? '');
  const [label, setLabel] = useState(draft?.title ?? '');
  const [lang, setLang] = useState(language);
  const [showPool, setShowPool] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useAutosize(area, text);

  const parts = useMemo(() => paragraphs(text), [text]);
  const inserting = afterId !== undefined;
  const hasWriting = Boolean(text.trim());

  useEffect(() => setLang(language), [language]);

  useEffect(() => {
    if (hasWriting) saveDraft(uid, draftKey, { title: label, body: text, writtenOn: '' });
    else clearDraft(uid, draftKey);
  }, [draftKey, hasWriting, label, text, uid]);

  useEffect(() => {
    if (!hasWriting) return;
    setHeld(() => clearDraft(uid, draftKey));
    return () => setHeld(null);
  }, [draftKey, hasWriting, setHeld, uid]);

  useEffect(() => {
    if (inserting || (autoFocus && hasFinePointer())) area.current?.focus();
  }, [autoFocus, inserting, afterId]);

  async function submit() {
    if (!parts.length) return;
    const tag = lang.trim();
    if (!isLanguageTag(tag)) {
      setError('Use a language tag such as en, it, or grc.');
      return;
    }
    setError(null);
    const written = text;
    setText('');
    setLabel('');
    area.current?.focus();
    const placement = inserting ? { afterId } : {};
    if (inserting) onDone();
    const unsaved = await store.addPassages({ versionId: version.id, text: written, label, language: tag, ...placement });
    // Whatever failed comes back to the box, so no writing is ever lost.
    if (unsaved.length) setText((current) => [unsaved.join('\n\n'), current].filter(Boolean).join('\n\n'));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && inserting) {
      event.stopPropagation();
      onDone();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const heading = afterId === null
    ? 'Insert at the start'
    : afterLabel
      ? `Insert after “${afterLabel}”`
      : null;

  return (
    <form
      className={`composer passage-composer${inserting ? ' is-inserting' : ''}`}
      aria-label="Write a passage"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {heading && <p className="composer-where">{heading}</p>}
      <textarea
        ref={area}
        aria-label="Next passage"
        placeholder={version.beats.length ? 'What happens next?' : 'Begin the story…'}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="composer-bar">
        <div className="composer-tools">
          {parts.length > 1 ? (
            <span className="small muted" role="status">{parts.length} passages, one beat each</span>
          ) : (
            <input
              className="beat-label-input"
              aria-label="Passage label"
              placeholder={parts[0] ? deriveLabel(parts[0]) : 'Beat label (automatic)'}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          )}
          <input
            className="language-input"
            aria-label="Language"
            title="Language of this passage"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
          />
          {omitted.length > 0 && (
            <button
              type="button"
              className="date-chip"
              aria-expanded={showPool}
              onClick={() => setShowPool((value) => !value)}
            >
              From the pool ({omitted.length})
            </button>
          )}
        </div>
        <div className="composer-send">
          {inserting && <button type="button" className="text-button" onClick={onDone}>Cancel</button>}
          <kbd>Enter</kbd>
          <button type="submit" className="post-button" disabled={!parts.length}>
            <CornerDownLeft size={14} aria-hidden="true" />
            Add passage
          </button>
        </div>
      </div>
      {showPool && (
        <ul className="pool-list" aria-label="Beats from the pool">
          {omitted.map((beat) => (
            <li key={beat.id}>
              <button
                type="button"
                aria-label={`Add “${beat.label}” to this variation`}
                onClick={() => {
                  void store.addFromPool(version.id, beat.id, beat.wordings[0]?.id ?? null, inserting ? afterId : undefined);
                  setShowPool(false);
                  area.current?.focus();
                  if (inserting) onDone();
                }}
              >
                <Plus size={13} aria-hidden="true" />
                <span className="candidate-name">{beat.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

type ReaderProps = {
  store: MythStore;
  full: MythFull;
  version: FullVersion;
  passages: Passage[];
  selected: string | null;
  linked: string | null;
  editing: string | null;
  onLink(id: string | null): void;
  onSelect(id: string): void;
  onEdit(id: string | null): void;
};

/**
 * The telling as one text. Each passage is a grid row holding its prose and its margin,
 * so a beat's bracket always spans exactly its passage with nothing to measure.
 */
export function Reader({ store, full, version, passages, selected, linked, editing, onLink, onSelect, onEdit }: ReaderProps) {
  const [insertAfter, setInsertAfter] = useState<string | null | undefined>(undefined);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAfter, setDropAfter] = useState<string | null | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const refocus = useRef<string | null>(null);
  const rows = version.beats;
  const language = currentLanguage(passages);
  const usedBeats = new Set(rows.map((row) => row.beatId));
  const omitted = full.beats.filter((beat) => !usedBeats.has(beat.id));

  useLayoutEffect(() => {
    if (!refocus.current) return;
    const id = refocus.current;
    refocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus();
  });

  // On narrow screens the details sheet would otherwise cover the passage it describes.
  useEffect(() => {
    if (!selected || !window.matchMedia?.('(max-width: 62rem)').matches) return;
    root.current
      ?.querySelector(`[data-row="${CSS.escape(selected)}"]`)
      ?.closest('.passage')
      ?.scrollIntoView({ block: 'start' });
  }, [selected]);

  function moveBy(id: string, delta: -1 | 1) {
    const afterId = afterIdForMove(rows, id, delta);
    if (afterId === undefined) return;
    refocus.current = id;
    void store.moveRow(version.id, id, afterId);
  }

  function onTagKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveBy(id, event.key === 'ArrowUp' ? -1 : 1);
  }

  function onDragOver(event: DragEvent<HTMLElement>, index: number) {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = event.currentTarget.getBoundingClientRect();
    const below = event.clientY > box.top + box.height / 2;
    const anchor = below ? index : index - 1;
    setDropAfter(anchor < 0 ? null : rows[anchor]!.id);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (dragged && dropAfter !== undefined && dropAfter !== dragged) {
      const index = rows.findIndex((row) => row.id === dragged);
      const current = index === 0 ? null : rows[index - 1]!.id;
      if (dropAfter !== current) void store.moveRow(version.id, dragged, dropAfter);
    }
    setDragged(null);
    setDropAfter(undefined);
  }

  function openFromProse(event: MouseEvent<HTMLElement>, id: string) {
    if ((event.target as HTMLElement).closest('a, button, textarea, input')) return;
    if (!window.getSelection()?.isCollapsed) return;
    onSelect(id);
  }

  const composer = (
    <PassageComposer
      key="composer"
      store={store}
      version={version}
      language={language}
      omitted={omitted}
      afterId={insertAfter}
      afterLabel={passages.find((passage) => passage.row.id === insertAfter)?.beat?.label ?? null}
      autoFocus={rows.length === 0}
      onDone={() => setInsertAfter(undefined)}
    />
  );

  const children: ReactNode[] = [];
  if (insertAfter === null) children.push(composer);
  passages.forEach((passage, index) => {
    const { row, beat, wording, borrowed } = passage;
    const label = beat?.label ?? 'Missing beat';
    const number = index + 1;
    const isEditing = editing === row.id;
    const classes = [
      'passage',
      index === 0 ? 'is-first' : '',
      selected === row.id ? 'is-selected' : '',
      linked === row.id ? 'is-linked' : '',
      dragged === row.id ? 'is-dragged' : '',
      dropAfter === row.id ? 'drop-below' : '',
      index === 0 && dropAfter === null ? 'drop-above' : '',
    ].filter(Boolean).join(' ');

    children.push(
      <div
        key={row.id}
        className={classes}
        role="group"
        aria-label={`Passage ${number}: ${label}`}
        onMouseEnter={() => onLink(row.id)}
        onMouseLeave={() => onLink(null)}
        onFocus={() => onLink(row.id)}
        onBlur={() => onLink(null)}
        onDragOver={(event) => onDragOver(event, index)}
        onDrop={onDrop}
      >
        <div className="passage-text" onClick={(event) => openFromProse(event, row.id)}>
          {isEditing ? (
            <PassageEditor
              label={label}
              initial={wording?.text ?? ''}
              onCancel={() => onEdit(null)}
              onSave={(text) => {
                onEdit(null);
                if (wording && !borrowed) void store.saveWording(wording.id, text);
                else void store.addWording(row.beatId, language, text, { versionId: version.id, rowId: row.id });
              }}
            />
          ) : wording ? (
            <div className={borrowed ? 'is-borrowed' : undefined}>
              <Prose text={wording.text} language={wording.language} />
            </div>
          ) : (
            <button type="button" className="write-passage" onClick={() => onEdit(row.id)}>
              Write this passage: {label}
            </button>
          )}
        </div>
        <div className="passage-margin">
          <div className="margin-sticky">
            <span
              className="beat-grip"
              draggable
              aria-hidden="true"
              title="Drag to reorder"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', label);
                setDragged(row.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setDropAfter(undefined);
              }}
            >
              <GripVertical size={13} />
            </span>
            <button
              type="button"
              className="beat-tag"
              data-row={row.id}
              aria-pressed={selected === row.id}
              aria-label={`Beat ${number}: ${label}`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              title="Open this beat. Alt+Up or Alt+Down reorders it."
              onClick={() => onSelect(row.id)}
              onKeyDown={(event) => onTagKey(event, row.id)}
            >
              <span className="beat-number" aria-hidden="true">{number}</span>
              <span className="beat-label">{label}</span>
            </button>
            {borrowed && <span className="margin-flag">wording not chosen</span>}
            {row.note && <span className="margin-note">{row.note}</span>}
          </div>
        </div>
        <button
          type="button"
          className="insert-after"
          aria-label={`Insert a passage after ${label}`}
          title="Insert a passage here"
          onClick={() => setInsertAfter(row.id)}
        >
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>,
    );
    if (insertAfter === row.id) children.push(composer);
  });
  if (insertAfter === undefined || (insertAfter !== null && !rows.some((row) => row.id === insertAfter))) {
    children.push(composer);
  }

  return (
    <article ref={root} className="telling" aria-label={`Reading ${version.title}`}>
      {rows.length > 0 && insertAfter !== null && (
        <button type="button" className="text-button insert-start" onClick={() => setInsertAfter(null)}>
          <Plus size={13} aria-hidden="true" /> Insert at the start
        </button>
      )}
      {children}
    </article>
  );
}
