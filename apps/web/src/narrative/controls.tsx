import { Plus, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { isAbort } from '../traces/api';
import { narrativeError } from './api';

/** Grows a textarea with its text, so that writing never scrolls inside a small box. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [ref, value]);
}

type InlineTextProps = {
  value: string | null;
  label: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  /** Blank is refused and reverts, for names the API requires. */
  required?: boolean;
  onSave(next: string | null): void;
};

/** Reads as plain text and edits in place: Enter or leaving saves, Escape reverts. */
export function InlineText({ value, label, placeholder, className, multiline, required, onSave }: InlineTextProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useAutosize(area, draft);

  useEffect(() => {
    if (!focused) setDraft(value ?? '');
  }, [focused, value]);

  function commit() {
    setFocused(false);
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value ?? '');
      return;
    }
    const next = draft.trim();
    if (next === (value ?? '')) return;
    if (!next && required) {
      setDraft(value ?? '');
      return;
    }
    onSave(next || null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      cancelled.current = true;
      event.stopPropagation();
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  const shared = {
    'aria-label': label,
    className: `inline-text ${className ?? ''}`,
    placeholder,
    value: draft,
    onFocus: () => setFocused(true),
    onBlur: commit,
    onKeyDown,
  };
  return multiline ? (
    <textarea {...shared} ref={area} rows={1} onChange={(event) => setDraft(event.target.value)} />
  ) : (
    <input {...shared} onChange={(event) => setDraft(event.target.value)} />
  );
}

export type PickerItem = { id: string; name: string };

type EntityPickerProps = {
  /** Lowercase singular, as in "tradition". */
  noun: string;
  load(signal: AbortSignal): Promise<PickerItem[]>;
  exclude: ReadonlySet<string>;
  onPick(item: PickerItem): void;
  onCreate(name: string): void;
  onClose(): void;
};

/** Find or create in one field: Enter takes the exact match, or else creates the name. */
export function EntityPicker({ noun, load, exclude, onPick, onCreate, onClose }: EntityPickerProps) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const loader = useRef(load);

  useEffect(() => {
    input.current?.focus();
    const controller = new AbortController();
    loader.current(controller.signal).then(setItems, (caught: unknown) => {
      if (!isAbort(caught)) setError(narrativeError(caught));
    });
    return () => controller.abort();
  }, []);

  const name = query.trim();
  const candidates = useMemo(() => {
    const needle = name.toLowerCase();
    return items.filter((item) => !exclude.has(item.id) && item.name.toLowerCase().includes(needle));
  }, [exclude, items, name]);
  const exact = items.find((item) => item.name.toLowerCase() === name.toLowerCase());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name) return;
    if (exact && !exclude.has(exact.id)) onPick(exact);
    else if (!exact) onCreate(name);
    else return;
    onClose();
  }

  return (
    <form
      className="picker entity-picker"
      aria-label={`Choose a ${noun}`}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="picker-row">
        <input
          ref={input}
          aria-label={`Find or name a ${noun}`}
          placeholder={`Find or name a ${noun}…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {(candidates.length > 0 || (name && !exact)) && (
        <ul className="candidates">
          {candidates.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
              >
                <span className="candidate-name">{item.name}</span>
              </button>
            </li>
          ))}
          {name && !exact && (
            <li>
              <button type="submit">
                <span className="candidate-name">
                  <Plus size={13} aria-hidden="true" /> Create {noun} “{name}”
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
