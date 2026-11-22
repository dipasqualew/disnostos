import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatDayNumber, formatMonth, formatWeekday, formatCalendarDate } from '../lib/dates';
import { Link, useRouter } from '../router';
import { errorMessage, isAbort, type Trace, type TracesApi } from './api';
import { Loading, Notice } from './ui';

const PAGE_SIZE = 20;

/** Groups traces that are already sorted newest first, keeping that order. */
export function groupByMonth(traces: Trace[]): { month: string; traces: Trace[] }[] {
  const groups: { month: string; traces: Trace[] }[] = [];
  for (const trace of traces) {
    const month = trace.writtenOn.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.traces.push(trace);
    else groups.push({ month, traces: [trace] });
  }
  return groups;
}

export const excerpt = (body: string, length = 180) => {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
};

export function TraceList({ api }: { api: TracesApi }) {
  const { search, navigate } = useRouter();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [items, setItems] = useState<Trace[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setMoreError(null);
    api.list({ from, to, limit: PAGE_SIZE }, controller.signal).then(
      (page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setStatus('ready');
      },
      (caught) => {
        if (isAbort(caught)) return;
        setError(errorMessage(caught));
        setStatus('error');
      },
    );
    return () => controller.abort();
  }, [api, from, to, attempt]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await api.list({ from, to, cursor, limit: PAGE_SIZE });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setMoreError(errorMessage(caught));
    } finally {
      setMoreBusy(false);
    }
  }, [api, cursor, from, to]);

  function applyFilter(event: FormEvent) {
    event.preventDefault();
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setFilterError('The start date must be on or before the end date.');
      return;
    }
    setFilterError(null);
    const next = new URLSearchParams();
    if (draftFrom) next.set('from', draftFrom);
    if (draftTo) next.set('to', draftTo);
    navigate(next.size ? `/?${next}` : '/');
  }

  function clearFilter() {
    setFilterError(null);
    setDraftFrom('');
    setDraftTo('');
    navigate('/');
  }

  const filtered = Boolean(from || to);
  const groups = groupByMonth(items);

  return (
    <>
      <div className="page-head">
        <h1>Traces</h1>
        <Link to="/traces/new" className="button">Write a trace</Link>
      </div>

      <form className="filter" onSubmit={applyFilter} aria-label="Filter traces by date">
        <label>
          From
          <input type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDraftFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDraftTo(e.target.value)} />
        </label>
        <button type="submit" className="quiet">Filter</button>
        {filtered && (
          <button type="button" className="link" onClick={clearFilter}>Clear</button>
        )}
      </form>
      {filterError && <p className="error" role="alert">{filterError}</p>}

      {status === 'loading' && <Loading label="Gathering your traces…" />}
      {status === 'error' && <Notice onRetry={() => setAttempt((n) => n + 1)}>{error}</Notice>}

      {status === 'ready' && items.length === 0 && (
        <div className="empty">
          {filtered ? (
            <p>No traces in these dates.</p>
          ) : (
            <>
              <p className="empty-lead">Nothing written yet.</p>
              <p className="muted">Begin with today. A few lines are enough.</p>
              <Link to="/traces/new" className="button">Write today’s trace</Link>
            </>
          )}
        </div>
      )}

      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.month} className="month" aria-label={formatMonth(group.month)}>
            <h2>{formatMonth(group.month)}</h2>
            <ol className="trace-list">
              {group.traces.map((trace) => (
                <li key={trace.id}>
                  <Link to={`/traces/${trace.id}`} className="trace-row">
                    <span className="day" aria-hidden="true">
                      <span className="day-number">{formatDayNumber(trace.writtenOn)}</span>
                      <span className="day-name">{formatWeekday(trace.writtenOn).slice(0, 3)}</span>
                    </span>
                    <span className="row-text">
                      <span className="sr-only">{formatCalendarDate(trace.writtenOn)}: </span>
                      <span className="row-title">{trace.title ?? 'Untitled'}</span>
                      <span className="row-excerpt">{excerpt(trace.body)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}

      {status === 'ready' && moreError && (
        <Notice onRetry={() => void loadMore()}>{moreError}</Notice>
      )}
      {status === 'ready' && cursor && !moreError && (
        <button type="button" className="quiet load-more" disabled={moreBusy} onClick={() => void loadMore()}>
          {moreBusy ? 'Loading…' : 'Load older traces'}
        </button>
      )}
    </>
  );
}
