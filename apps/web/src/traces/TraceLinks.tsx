import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatCalendarDate } from '../lib/dates';
import { Link } from '../router';
import { ApiError, errorMessage, isAbort, type Trace, type TraceLink, type TracesApi } from './api';
import { Loading, Notice } from './ui';

const PICKER_PAGE_SIZE = 100;

/** Traces that can still be linked: not this one, not already linked, matching the search. */
export function linkCandidates(
  traces: Trace[],
  selfId: string,
  links: Pick<TraceLink, 'trace'>[],
  query: string,
): Trace[] {
  const linked = new Set(links.map((link) => link.trace.id));
  const needle = query.trim().toLocaleLowerCase();
  return traces.filter(
    (trace) =>
      trace.id !== selfId &&
      !linked.has(trace.id) &&
      (!needle ||
        [trace.title ?? '', trace.body, trace.writtenOn, formatCalendarDate(trace.writtenOn)].some(
          (text) => text.toLocaleLowerCase().includes(needle),
        )),
  );
}

type PickerProps = {
  api: TracesApi;
  traceId: string;
  links: TraceLink[];
  onLinked(link: TraceLink): void;
  onConflict(): void;
  onClose(): void;
};

function LinkPicker({ api, traceId, links, onLinked, onConflict, onClose }: PickerProps) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    api.list({ limit: PICKER_PAGE_SIZE }, controller.signal).then(
      (page) => {
        setTraces(page.items);
        setCursor(page.nextCursor);
        setStatus('ready');
      },
      (caught) => {
        if (isAbort(caught)) return;
        setLoadError(errorMessage(caught));
        setStatus('error');
      },
    );
    return () => controller.abort();
  }, [api, attempt]);

  const candidates = useMemo(
    () => linkCandidates(traces, traceId, links, query),
    [traces, traceId, links, query],
  );
  const selectedIsVisible = candidates.some((trace) => trace.id === selected);

  async function loadOlder() {
    if (!cursor) return;
    setMoreBusy(true);
    setError(null);
    try {
      const page = await api.list({ limit: PICKER_PAGE_SIZE, cursor });
      setTraces((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setMoreBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !selectedIsVisible) {
      setError('Choose a trace to link.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onLinked(await api.link(traceId, selected, note.trim() || null));
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiError && caught.status === 409) {
        setSelected(null);
        onConflict();
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <Loading label="Finding your traces…" />;
  if (status === 'error') return <Notice onRetry={() => setAttempt((n) => n + 1)}>{loadError}</Notice>;

  return (
    <form className="picker" onSubmit={submit}>
      <label>
        Search your traces
        <input type="search" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      </label>
      <fieldset>
        <legend className="sr-only">Trace to link</legend>
        {candidates.length === 0 && (
          <p className="muted">{query ? 'No matching traces.' : 'No other traces to link yet.'}</p>
        )}
        {candidates.length > 0 && (
          <ul className="candidates">
            {candidates.map((trace) => (
              <li key={trace.id}>
                <label className="candidate">
                  <input
                    type="radio"
                    name="link-target"
                    value={trace.id}
                    checked={selected === trace.id}
                    onChange={() => setSelected(trace.id)}
                  />
                  <span>
                    <span className="row-title">{trace.title ?? 'Untitled'}</span>
                    <span className="muted small">{formatCalendarDate(trace.writtenOn)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button type="button" className="link" disabled={moreBusy} onClick={() => void loadOlder()}>
            {moreBusy ? 'Loading…' : 'Search older traces'}
          </button>
        )}
      </fieldset>
      <label>
        Why these connect (optional)
        <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="quiet" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy || !selectedIsVisible}>{busy ? 'Linking…' : 'Link trace'}</button>
      </div>
    </form>
  );
}

type Props = {
  api: TracesApi;
  traceId: string;
  links: TraceLink[];
  onChange(links: TraceLink[]): void;
  onRefresh(): void;
};

export function TraceLinks({ api, traceId, links, onChange, onRefresh }: Props) {
  const [picking, setPicking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unlink(link: TraceLink) {
    setUnlinking(link.id);
    setError(null);
    try {
      await api.unlink(traceId, link.id);
      onChange(links.filter((item) => item.id !== link.id));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="links-heading">
      <div className="panel-head">
        <h2 id="links-heading">Linked traces</h2>
        {!picking && (
          <button type="button" className="quiet" onClick={() => setPicking(true)}>Link a trace</button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picking && (
        <LinkPicker
          api={api}
          traceId={traceId}
          links={links}
          onLinked={(link) => onChange([...links, link])}
          onConflict={onRefresh}
          onClose={() => setPicking(false)}
        />
      )}
      {links.length === 0 && !picking && <p className="muted">Not linked to any other trace.</p>}
      {links.length > 0 && (
        <ul className="links">
          {links.map((link) => (
            <li key={link.id}>
              <div>
                <Link to={`/traces/${link.trace.id}`}>{link.trace.title ?? 'Untitled'}</Link>
                <span className="muted small"> · {formatCalendarDate(link.trace.writtenOn)}</span>
                {link.note && <p className="link-note">{link.note}</p>}
              </div>
              <button
                type="button"
                className="link"
                disabled={unlinking === link.id}
                aria-label={`Unlink ${link.trace.title ?? 'Untitled'}`}
                onClick={() => void unlink(link)}
              >
                {unlinking === link.id ? 'Unlinking…' : 'Unlink'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
