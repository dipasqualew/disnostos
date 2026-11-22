import { CalendarDays, Link2, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { formatCalendarDate, formatWeekday, localToday } from '../lib/dates';
import { Link, useRouter } from '../router';
import { errorMessage, isAbort, type Trace, type TracesApi } from './api';
import { Composer } from './Composer';
import { plainText } from './markdown';
import { isLongBody, TraceContent } from './TraceContent';
import { useToasts } from './toasts';
import { Loading, Notice } from './ui';

const PAGE_SIZE = 20;

/** Groups traces that are already sorted newest first, keeping that order. */
export function groupByDay(traces: Trace[]): { day: string; traces: Trace[] }[] {
  const groups: { day: string; traces: Trace[] }[] = [];
  for (const trace of traces) {
    const last = groups.at(-1);
    if (last?.day === trace.writtenOn) last.traces.push(trace);
    else groups.push({ day: trace.writtenOn, traces: [trace] });
  }
  return groups;
}

export const excerpt = (body: string, length = 80) => {
  const flat = plainText(body);
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
};

export const traceName = (trace: Pick<Trace, 'title' | 'body'>) => trace.title ?? (excerpt(trace.body) || 'Image');

export function dayLabel(day: string, today = localToday()): string {
  if (day === today) return 'Today';
  const previous = new Date(`${today}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  if (day === previous.toISOString().slice(0, 10)) return 'Yesterday';
  return `${formatWeekday(day)}, ${formatCalendarDate(day)}`;
}

const newestFirst = (a: Trace, b: Trace) =>
  b.writtenOn.localeCompare(a.writtenOn) || b.createdAt.localeCompare(a.createdAt);

function TraceCard({ api, trace }: { api: TracesApi; trace: Trace }) {
  const { navigate } = useRouter();
  const { deleteTrace } = useToasts();
  const [expanded, setExpanded] = useState(false);
  const long = isLongBody(trace.body);
  const name = traceName(trace);
  const to = `/traces/${trace.id}`;

  // The whole card opens the trace, unless someone is selecting text or using a control.
  function open(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a, button')) return;
    if (!window.getSelection()?.isCollapsed) return;
    navigate(to);
  }

  return (
    <article className="trace-card" aria-label={name} onClick={open}>
      {trace.title && <h3 className="card-title">{trace.title}</h3>}
      <div className={long && !expanded ? 'is-collapsed' : undefined}>
        <TraceContent api={api} traceId={trace.id} body={trace.body} />
      </div>
      {long && (
        <button type="button" className="text-button show-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className="card-actions">
        <Link to={to} className="icon-button" aria-label={`Edit ${name}`} title="Edit">
          <Pencil size={15} aria-hidden="true" />
        </Link>
        <Link to={`${to}?link=1`} className="icon-button" aria-label={`Link ${name}`} title="Link to another trace">
          <Link2 size={15} aria-hidden="true" />
        </Link>
        <button type="button" className="icon-button" aria-label={`Delete ${name}`} title="Delete" onClick={() => deleteTrace(trace.id)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function TraceList({ api }: { api: TracesApi }) {
  const { search, navigate } = useRouter();
  const { deleting, notify, savesSettled } = useToasts();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const [filterOpen, setFilterOpen] = useState(Boolean(from || to));
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
  const sentinel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setMoreError(null);
    savesSettled().then(() => api.list({ from, to, limit: PAGE_SIZE }, controller.signal)).then(
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
  }, [api, from, to, attempt, savesSettled]);

  const loadMore = useCallback(async () => {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await api.list({ from, to, cursor, limit: PAGE_SIZE });
      setItems((current) => {
        const known = new Set(current.map((trace) => trace.id));
        return [...current, ...page.items.filter((trace) => !known.has(trace.id))];
      });
      setCursor(page.nextCursor);
    } catch (caught) {
      setMoreError(errorMessage(caught));
    } finally {
      setMoreBusy(false);
    }
  }, [api, cursor, from, moreBusy, to]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, status]);

  const onPosted = useCallback(
    (trace: Trace) => {
      if ((from && trace.writtenOn < from) || (to && trace.writtenOn > to)) {
        notify('Saved, outside the dates you are viewing.');
        return;
      }
      setItems((current) => [trace, ...current.filter((item) => item.id !== trace.id)].sort(newestFirst));
    },
    [from, notify, to],
  );

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
    setFilterOpen(false);
    navigate('/');
  }

  const filtered = Boolean(from || to);
  const visible = items.filter((trace) => !deleting.has(trace.id));
  const groups = groupByDay(visible);

  return (
    <>
      <h1 className="sr-only">Traces</h1>
      <Composer api={api} onPosted={onPosted} />

      <div className="feed-tools">
        <button
          type="button"
          className={`chip${filtered ? ' is-active' : ''}`}
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <CalendarDays size={14} aria-hidden="true" /> {filtered ? 'Filtered by date' : 'Filter by date'}
        </button>
      </div>
      {filterOpen && (
        <form className="filter" onSubmit={applyFilter} aria-label="Filter traces by date">
          <label>
            From
            <input type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDraftFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDraftTo(e.target.value)} />
          </label>
          <button type="submit" className="quiet">Apply</button>
          {filtered && <button type="button" className="text-button" onClick={clearFilter}>Clear</button>}
        </form>
      )}
      {filterError && <p className="error" role="alert">{filterError}</p>}

      {status === 'loading' && <Loading label="Gathering your traces…" />}
      {status === 'error' && <Notice onRetry={() => setAttempt((n) => n + 1)}>{error}</Notice>}

      {status === 'ready' && visible.length === 0 && (
        <div className="empty">
          {filtered ? (
            <p>No traces in these dates.</p>
          ) : (
            <>
              <h2 className="empty-lead">Nothing here yet</h2>
              <p className="muted">A line, a verse, or a link is enough to begin.</p>
            </>
          )}
        </div>
      )}

      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.day} className="day-group" aria-label={dayLabel(group.day)}>
            <h2>
              <time dateTime={group.day}>{dayLabel(group.day)}</time>
            </h2>
            <div className="day-traces">
              {group.traces.map((trace) => (
                <TraceCard key={`${trace.id}:${trace.updatedAt}`} api={api} trace={trace} />
              ))}
            </div>
          </section>
        ))}

      {status === 'ready' && moreError && <Notice onRetry={() => void loadMore()}>{moreError}</Notice>}
      {status === 'ready' && cursor && !moreError && (
        <button ref={sentinel} type="button" className="quiet load-more" disabled={moreBusy} onClick={() => void loadMore()}>
          {moreBusy ? 'Loading…' : 'Load older traces'}
        </button>
      )}
    </>
  );
}
