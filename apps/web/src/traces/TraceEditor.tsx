import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { isCalendarDate, localToday } from '../lib/dates';
import { Link, useRouter, useUnsavedGuard } from '../router';
import { ApiError, errorMessage, isAbort, type TracesApi } from './api';
import { clearDraft, loadDraft, saveDraft, type Draft } from './drafts';
import { Loading, Notice } from './ui';

const sameDraft = (a: Draft, b: Draft) =>
  a.title === b.title && a.body === b.body && a.writtenOn === b.writtenOn;

export function TraceEditor({ api, traceId }: { api: TracesApi; traceId: string | null }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const uid = user?.uid ?? '';

  const [saved, setSaved] = useState<Draft | null>(() =>
    traceId ? null : { title: '', body: '', writtenOn: localToday() },
  );
  const [form, setForm] = useState<Draft>(() => {
    const blank = { title: '', body: '', writtenOn: localToday() };
    return traceId ? blank : (loadDraft(uid, null) ?? blank);
  });
  const [restored, setRestored] = useState(() => !traceId && loadDraft(uid, null) !== null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!traceId) return;
    const controller = new AbortController();
    setLoadError(null);
    api.get(traceId, controller.signal).then(
      (trace) => {
        const current = { title: trace.title ?? '', body: trace.body, writtenOn: trace.writtenOn };
        const draft = loadDraft(uid, traceId);
        setSaved(current);
        setForm(draft ?? current);
        setRestored(draft !== null && !sameDraft(draft, current));
      },
      (caught) => {
        if (isAbort(caught)) return;
        setLoadError(caught instanceof ApiError ? caught : new ApiError(0, 'Network error'));
      },
    );
    return () => controller.abort();
  }, [api, traceId, uid, attempt]);

  const dirty = saved !== null && !sameDraft(form, saved);

  useEffect(() => {
    if (saved === null) return;
    if (dirty) saveDraft(uid, traceId, form);
    else clearDraft(uid, traceId);
  }, [dirty, form, saved, traceId, uid]);

  useUnsavedGuard(dirty, () => clearDraft(uid, traceId));

  const update = (patch: Partial<Draft>) => setForm((current) => ({ ...current, ...patch }));

  async function save(attachImage: boolean) {
    if (busy) return;
    if (!form.body.trim()) {
      setError('Write something before saving.');
      body.current?.focus();
      return;
    }
    if (!isCalendarDate(form.writtenOn)) {
      setError('Choose a valid date.');
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      title: form.title.trim() || null,
      body: form.body,
      writtenOn: form.writtenOn,
    };
    try {
      const trace = traceId ? await api.update(traceId, input) : await api.create(input);
      clearDraft(uid, traceId);
      navigate(`/traces/${trace.id}${attachImage ? '?attach=1' : ''}`, {
        force: true,
        replace: true,
      });
    } catch (caught) {
      // The form is left exactly as typed, and the draft stays in this tab.
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }

  if (loadError) {
    return loadError.status === 404 ? (
      <>
        <h1>Trace not found</h1>
        <Link to="/">Back to your traces</Link>
      </>
    ) : (
      <Notice onRetry={() => setAttempt((n) => n + 1)}>{errorMessage(loadError)}</Notice>
    );
  }
  if (saved === null) return <Loading />;

  const cancelTo = traceId ? `/traces/${traceId}` : '/';

  return (
    <>
      <h1>{traceId ? 'Edit trace' : 'A new trace'}</h1>
      {restored && (
        <p className="restored" role="status">
          Restored your unsaved writing from this tab.
        </p>
      )}
      <form className="editor" onSubmit={submit}>
        <div className="editor-meta">
          <label className="grow">
            Title (optional)
            <input type="text" value={form.title} maxLength={300} onChange={(e) => update({ title: e.target.value })} />
          </label>
          <label>
            Date
            <input type="date" required value={form.writtenOn} onChange={(e) => update({ writtenOn: e.target.value })} />
          </label>
        </div>
        <label>
          Your writing
          <textarea
            ref={body}
            required
            rows={14}
            value={form.body}
            onChange={(e) => update({ body: e.target.value })}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <Link to={cancelTo} className="button quiet">Cancel</Link>
          {!traceId && (
            <button type="button" className="quiet" disabled={busy} onClick={() => void save(true)}>
              Save and add image
            </button>
          )}
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </>
  );
}
