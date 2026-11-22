import { useEffect, useState } from 'react';
import { formatCalendarDate, formatWeekday } from '../lib/dates';
import { Link, useRouter } from '../router';
import { ApiError, errorMessage, isAbort, type TraceDetail, type TracesApi } from './api';
import { TraceImages } from './TraceImages';
import { TraceLinks } from './TraceLinks';
import { ConfirmDialog, Loading, Notice } from './ui';

export function TraceView({ api, traceId }: { api: TracesApi; traceId: string }) {
  const { search, path, navigate } = useRouter();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [focusPicker, setFocusPicker] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    setTrace((current) => (current?.id === traceId ? current : null));
    api.get(traceId, controller.signal).then(setTrace, (caught) => {
      if (isAbort(caught)) return;
      setLoadError(caught instanceof ApiError ? caught : new ApiError(0, 'Network error'));
    });
    return () => controller.abort();
  }, [api, traceId, attempt]);

  useEffect(() => {
    if (!trace || !new URLSearchParams(search).has('attach')) return;
    setFocusPicker(true);
    navigate(path, { replace: true });
  }, [trace, search, path, navigate]);

  async function confirmDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.remove(traceId);
      navigate('/', { replace: true });
    } catch (caught) {
      setDeleteError(errorMessage(caught));
      setDeleteBusy(false);
    }
  }

  if (loadError?.status === 404) {
    return (
      <>
        <h1>Trace not found</h1>
        <p className="muted">It may have been deleted.</p>
        <Link to="/">Back to your traces</Link>
      </>
    );
  }
  if (loadError) return <Notice onRetry={() => setAttempt((n) => n + 1)}>{errorMessage(loadError)}</Notice>;
  if (!trace) return <Loading />;

  return (
    <article className="trace">
      <Link to="/" className="back">← All traces</Link>
      <header>
        <p className="trace-date">
          <time dateTime={trace.writtenOn}>
            {formatWeekday(trace.writtenOn)}, {formatCalendarDate(trace.writtenOn)}
          </time>
        </p>
        <h1>{trace.title ?? 'Untitled'}</h1>
      </header>
      <div className="trace-body">{trace.body}</div>
      <div className="actions trace-actions">
        <Link to={`/traces/${trace.id}/edit`} className="button quiet">Edit</Link>
        <button
          type="button"
          className="quiet danger-text"
          onClick={() => {
            setDeleteError(null);
            setDeleting(true);
          }}
        >
          Delete
        </button>
      </div>

      <TraceImages
        api={api}
        traceId={trace.id}
        images={trace.images}
        focusPicker={focusPicker}
        onChange={(images) => setTrace((current) => current && { ...current, images })}
      />
      <TraceLinks
        api={api}
        traceId={trace.id}
        links={trace.links}
        onChange={(links) => setTrace((current) => current && { ...current, links })}
        onRefresh={() => setAttempt((n) => n + 1)}
      />

      {deleting && (
        <ConfirmDialog
          title="Delete this trace?"
          body="The writing, its images, and its links will be permanently deleted. This cannot be undone."
          confirmLabel="Delete trace"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </article>
  );
}
