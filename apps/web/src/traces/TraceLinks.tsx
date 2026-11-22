import { Link2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatCalendarDate } from '../lib/dates';
import { Link } from '../router';
import { ApiError, errorMessage, isAbort, type Trace, type TraceLink, type TracesApi } from './api';
import { plainText } from './markdown';
import { Loading, Notice } from './ui';

const PICKER_PAGE_SIZE = 100;

const nameOf = (trace: Pick<Trace, 'title'> & { body?: string }) =>
  trace.title ?? (trace.body ? plainText(trace.body).slice(0, 70) : '');
const linkName = (link: TraceLink) => link.trace.title ?? formatCalendarDate(link.trace.writtenOn);

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

  async function choose(target: Trace) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onLinked(await api.link(traceId, target.id, note.trim() || null));
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiError && caught.status === 409) onConflict();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <Loading label="Finding your traces…" />;
  if (status === 'error') return <Notice onRetry={() => setAttempt((n) => n + 1)}>{loadError}</Notice>;

  return (
    <div
      className="picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <input
        type="search"
        aria-label="Search your traces"
        placeholder="Search your traces…"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      <input
        type="text"
        aria-label="Why these connect (optional)"
        placeholder="Why these connect (optional)"
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />
      {candidates.length === 0 && (
        <p className="muted">{query ? 'No matching traces.' : 'No other traces to link yet.'}</p>
      )}
      {candidates.length > 0 && (
        <ul className="candidates" aria-label="Traces to link">
          {candidates.map((trace) => (
            <li key={trace.id}>
              <button type="button" disabled={busy} onClick={() => void choose(trace)}>
                <span className="candidate-name">{nameOf(trace) || 'Image'}</span>
                <span className="muted small">{formatCalendarDate(trace.writtenOn)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button type="button" className="text-button" disabled={moreBusy} onClick={() => void loadOlder()}>
          {moreBusy ? 'Loading…' : 'Search older traces'}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

type Props = {
  api: TracesApi;
  traceId: string;
  links: TraceLink[];
  startOpen?: boolean;
  onChange(links: TraceLink[]): void;
  onRefresh(): void;
};

export function TraceLinks({ api, traceId, links, startOpen = false, onChange, onRefresh }: Props) {
  const [picking, setPicking] = useState(startOpen);
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
    <section className="trace-links" aria-label="Linked traces">
      <div className="link-row">
        {links.map((link) => (
          <span key={link.id} className="link-pill" title={link.note ?? undefined}>
            <Link2 size={13} aria-hidden="true" />
            <Link to={`/traces/${link.trace.id}`}>{linkName(link)}</Link>
            <button
              type="button"
              className="pill-remove"
              disabled={unlinking === link.id}
              aria-label={`Unlink ${linkName(link)}`}
              onClick={() => void unlink(link)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        {!picking && (
          <button type="button" className="chip" onClick={() => setPicking(true)}>
            <Plus size={14} aria-hidden="true" /> Link a trace
          </button>
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
    </section>
  );
}
