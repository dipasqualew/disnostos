import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '../router';
import { ConfirmDialog } from '../traces/ui';
import { beatInUse, narrativeError, type BeatInUse, type FullVersion, type MythFull, type PoolBeat, type VersionBeat } from './api';
import { InlineText, useAutosize } from './controls';
import { isLanguageTag, versionsUsing } from './model';
import { afterIdForMove } from './Reader';
import type { MythStore } from './useMyth';

type BeatPanelProps = {
  store: MythStore;
  api: { deleteBeat(id: string): Promise<void> };
  full: MythFull;
  version: FullVersion | null;
  beat: PoolBeat;
  /** This beat's place in the open telling. Null when the telling leaves it out. */
  row: VersionBeat | null;
  onClose(): void;
  onEdit(rowId: string): void;
};

const excerpt = (text: string, length = 120) =>
  text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;

function AddWording({ onAdd, defaultLanguage }: { onAdd(language: string, text: string): void; defaultLanguage: string }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(defaultLanguage);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useAutosize(area, text);
  useEffect(() => {
    if (open) area.current?.focus();
  }, [open]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const tag = language.trim();
    if (!text.trim()) return;
    if (!isLanguageTag(tag)) {
      setError('Use a language tag such as en, it, or grc.');
      return;
    }
    onAdd(tag, text.trim());
    setText('');
    setError(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="text-button add-wording" onClick={() => setOpen(true)}>
        <Plus size={13} aria-hidden="true" /> Add a wording
      </button>
    );
  }
  return (
    <form className="wording-form" aria-label="New wording" onSubmit={submit}>
      <textarea
        ref={area}
        aria-label="New wording"
        placeholder="Tell this moment another way…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="wording-form-bar">
        <input
          className="language-input"
          aria-label="Wording language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        />
        <button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="post-button" disabled={!text.trim()}>Add wording</button>
      </div>
    </form>
  );
}

/** Everything about one beat: its words in this telling, and its life in the others. */
export function BeatPanel({ store, api, full, version, beat, row, onClose, onEdit }: BeatPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [inUse, setInUse] = useState<BeatInUse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const using = versionsUsing(full, beat.id);
  const others = using.filter((other) => other.id !== version?.id);
  const rows = version?.beats ?? [];
  const chosenId = row
    ? (beat.wordings.find((wording) => wording.id === row.wordingId)?.id ?? null)
    : null;
  const shownId = chosenId ?? (row ? beat.wordings[0]?.id ?? null : null);
  const defaultLanguage = beat.wordings.at(-1)?.language ?? 'en';

  // Keyboard users land in the panel, and return to the beat they came from.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [beat.id]);

  function askDelete() {
    if (using.length) setInUse({ versions: using.map(({ id, title }) => ({ id, title })), versionBeatIds: [] });
    else setConfirming(true);
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await store.refresh(async () => {
        try {
          await api.deleteBeat(store.real(beat.id));
        } catch (caught) {
          const details = beatInUse(caught);
          if (!details) throw caught;
          setInUse(details);
          setConfirming(false);
        }
      }, 'Could not delete that beat.');
      setConfirming(false);
    } catch (caught) {
      setError(narrativeError(caught));
    } finally {
      setBusy(false);
    }
  }

  function move(delta: -1 | 1) {
    if (!row || !version) return;
    const afterId = afterIdForMove(rows, row.id, delta);
    if (afterId !== undefined) void store.moveRow(version.id, row.id, afterId);
  }

  const index = row ? rows.findIndex((other) => other.id === row.id) : -1;
  const titles = inUse?.versions.map((item) => item.title).join(', ') ?? '';
  const canRemoveHere = Boolean(row && inUse?.versions.some((item) => item.id === version?.id));

  return (
    <aside className="beat-panel" aria-label="Beat details" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose();
    }}>
      <div className="panel-head">
        <h2 ref={heading} tabIndex={-1}>{row ? `Beat ${index + 1}` : 'In the pool'}</h2>
        <button type="button" className="icon-button" aria-label="Close beat details" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <InlineText
        className="panel-label"
        label="Beat label"
        multiline
        value={beat.label}
        required
        onSave={(next) => {
          if (next) void store.renameBeat(beat.id, next);
        }}
      />

      {row && version ? (
        <div className="panel-tools">
          <button type="button" className="quiet" onClick={() => onEdit(row.id)}>
            <Pencil size={13} aria-hidden="true" /> Edit wording
          </button>
          <button type="button" className="icon-button" aria-label="Move earlier" disabled={index <= 0} onClick={() => move(-1)}>
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="Move later" disabled={index >= rows.length - 1} onClick={() => move(1)}>
            <ArrowDown size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="text-button panel-remove"
            onClick={() => {
              store.removeRow(version.id, row, beat.label);
              onClose();
            }}
          >
            Remove from this variation
          </button>
        </div>
      ) : version ? (
        <button
          type="button"
          className="post-button panel-add"
          onClick={() => void store.addFromPool(version.id, beat.id, beat.wordings[0]?.id ?? null)}
        >
          <Plus size={14} aria-hidden="true" /> Add to {version.title}
        </button>
      ) : null}

      <section aria-label="Wordings">
        <h3>Wordings</h3>
        {beat.wordings.length === 0 && <p className="small muted">No wording yet.</p>}
        {row && version ? (
          <div role="radiogroup" aria-label="Wording used in this variation" className="wordings">
            {beat.wordings.map((wording) => (
              <label key={wording.id} className={`wording-option${wording.id === shownId ? ' is-chosen' : ''}`}>
                <input
                  type="radio"
                  name={`wording-${row.id}`}
                  aria-label={`${wording.language}: ${excerpt(wording.text, 60)}`}
                  checked={wording.id === chosenId}
                  onChange={() => void store.updateRow(version.id, row.id, { wordingId: wording.id })}
                />
                <span className="wording-language">{wording.language}</span>
                <span className="wording-text" lang={wording.language}>{excerpt(wording.text)}</span>
              </label>
            ))}
          </div>
        ) : (
          <ul className="wordings">
            {beat.wordings.map((wording) => (
              <li key={wording.id} className="wording-option">
                <span className="wording-language">{wording.language}</span>
                <span className="wording-text" lang={wording.language}>{excerpt(wording.text)}</span>
              </li>
            ))}
          </ul>
        )}
        <AddWording
          defaultLanguage={defaultLanguage}
          onAdd={(language, text) =>
            void store.addWording(beat.id, language, text, row && version ? { versionId: version.id, rowId: row.id } : undefined)
          }
        />
      </section>

      {row && version && (
        <section aria-label="Note">
          <h3>Note in this variation</h3>
          <InlineText
            className="panel-note"
            label="Note"
            multiline
            placeholder="Why this beat, here?"
            value={row.note}
            onSave={(note) => void store.updateRow(version.id, row.id, { note })}
          />
        </section>
      )}

      <section aria-label="Other variations">
        <h3>Also told in</h3>
        {others.length ? (
          <ul className="also-in">
            {others.map((other) => (
              <li key={other.id}>
                <Link to={`/myths/${full.myth.id}?version=${other.id}`}>{other.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">{row ? 'Only this variation.' : 'No variation uses it yet.'}</p>
        )}
      </section>

      <button type="button" className="text-button panel-delete" onClick={askDelete}>
        <Trash2 size={13} aria-hidden="true" /> Delete beat
      </button>

      {confirming && (
        <ConfirmDialog
          title="Delete this beat?"
          body={`“${beat.label}” and all its wordings will be permanently deleted.`}
          confirmLabel="Delete beat"
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {inUse && (
        <ConfirmDialog
          title="This beat is still in use"
          body={`“${beat.label}” appears in ${titles}. A beat can only be deleted once no variation uses it.${canRemoveHere ? ' You can remove it from this variation and keep it in the pool.' : ''}`}
          confirmLabel={canRemoveHere ? 'Remove from this variation' : 'Close'}
          cancelLabel={canRemoveHere ? 'Keep it' : 'Back'}
          onCancel={() => setInUse(null)}
          onConfirm={() => {
            setInUse(null);
            if (canRemoveHere && row && version) {
              store.removeRow(version.id, row, beat.label);
              onClose();
            }
          }}
        />
      )}
    </aside>
  );
}
