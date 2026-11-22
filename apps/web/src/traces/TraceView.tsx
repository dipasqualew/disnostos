import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { isCalendarDate } from '../lib/dates';
import { Link, useRouter, useUnsavedGuard } from '../router';
import { ApiError, errorMessage, isAbort, type TraceDetail, type TraceImage, type TracesApi } from './api';
import { clearDraft, loadDraft, saveDraft, type Draft } from './drafts';
import { embeddedImageIds, parseBody, serializeBody, withoutPendingImages } from './markdown';
import { ImageButton, RichEditor, type Previews, type RichEditorHandle } from './TraceEditor';
import { imageFileProblem, LooseImages } from './TraceImages';
import { TraceLinks } from './TraceLinks';
import { useToasts } from './toasts';
import { Loading, Notice } from './ui';

export const AUTOSAVE_MS = 800;

type SaveState = 'saved' | 'waiting' | 'saving' | 'invalid' | 'error';

const sameDraft = (a: Draft, b: Draft) =>
  a.title === b.title && a.body === b.body && a.writtenOn === b.writtenOn;

function TraceDocument({ api, loaded, openLinks }: { api: TracesApi; loaded: TraceDetail; openLinks: boolean }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { deleteTrace, notify, trackSave } = useToasts();
  const uid = user?.uid ?? '';
  const traceId = loaded.id;

  // Compared in normalised form, so opening an old trace never rewrites it.
  const [baseline] = useState<Draft>(() => ({
    title: loaded.title ?? '',
    body: serializeBody(parseBody(loaded.body)),
    writtenOn: loaded.writtenOn,
  }));
  const [restoredDraft] = useState(() => {
    const draft = loadDraft(uid, traceId);
    return draft && !sameDraft(draft, baseline) ? draft : null;
  });
  const [form, setForm] = useState<Draft>(restoredDraft ?? baseline);
  const [status, setStatus] = useState<SaveState>(restoredDraft ? 'waiting' : 'saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [images, setImages] = useState<TraceImage[]>(loaded.images);
  const [links, setLinks] = useState(loaded.links);
  const [uploading, setUploading] = useState(0);

  const editor = useRef<RichEditorHandle>(null);
  const previews = useRef<Previews>(new Map());
  const latest = useRef(form);
  const saved = useRef(baseline);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleted = useRef(false);
  // Only images that were in the writing can be cleaned up when they leave it.
  const embedded = useRef(new Set(embeddedImageIds(loaded.body)));

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current) await running.current;
    const snapshot = latest.current;
    if (sameDraft(snapshot, saved.current)) {
      clearDraft(uid, traceId);
      setStatus('saved');
      return true;
    }
    if (!snapshot.body.trim() || !isCalendarDate(snapshot.writtenOn)) {
      setStatus('invalid');
      return false;
    }
    setStatus('saving');
    const job = api
      .update(traceId, {
        title: snapshot.title.trim() || null,
        // An untouched body is sent back byte for byte.
        body: snapshot.body === baseline.body ? loaded.body : snapshot.body,
        writtenOn: snapshot.writtenOn,
      })
      .then(
        () => {
          saved.current = snapshot;
          setSaveError(null);
          if (sameDraft(latest.current, snapshot)) {
            clearDraft(uid, traceId);
            setStatus('saved');
          }
          return true;
        },
        (caught) => {
          setSaveError(errorMessage(caught));
          setStatus('error');
          return false;
        },
      )
      .finally(() => {
        running.current = null;
      });
    running.current = job;
    const ok = await job;
    return ok && !sameDraft(latest.current, snapshot) ? flush() : ok;
  }, [api, baseline.body, loaded.body, traceId, uid]);

  const change = useCallback(
    (patch: Partial<Draft>) => {
      const next = { ...latest.current, ...patch };
      if (sameDraft(next, latest.current)) return;
      latest.current = next;
      setForm(next);
      setStatus('waiting');
      saveDraft(uid, traceId, next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush, traceId, uid],
  );

  const removeDroppedImages = useCallback(async () => {
    if (deleted.current || !sameDraft(latest.current, saved.current)) return;
    const kept = new Set(embeddedImageIds(saved.current.body));
    for (const id of [...embedded.current]) {
      if (kept.has(id)) continue;
      embedded.current.delete(id);
      await api.removeImage(traceId, id).catch(() => undefined);
    }
  }, [api, traceId]);

  useEffect(() => {
    if (restoredDraft) void flush();
    return () => {
      if (deleted.current) return;
      trackSave(flush().then((ok) => (ok ? removeDroppedImages() : undefined)));
    };
  }, [flush, removeDroppedImages, restoredDraft, trackSave]);

  useEffect(() => {
    if (status === 'saved') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // Changes save on their own. Only ones that could not be saved stop you leaving.
  useUnsavedGuard(status === 'error' || status === 'invalid' || uploading > 0, () => {
    deleted.current = true;
    clearDraft(uid, traceId);
  });

  useEffect(() => {
    const held = previews.current;
    return () => {
      held.forEach((preview) => URL.revokeObjectURL(preview.url));
      held.clear();
    };
  }, []);

  async function addFiles(files: File[]) {
    for (const file of files) {
      const problem = imageFileProblem(file);
      if (problem) {
        notify(problem);
        continue;
      }
      const key = crypto.randomUUID();
      previews.current.set(key, { url: URL.createObjectURL(file), file });
      editor.current?.insertPending(key, file.name);
      setUploading((n) => n + 1);
      try {
        const image = await api.addImage(traceId, file);
        embedded.current.add(image.id);
        setImages((current) => [...current, image]);
        editor.current?.resolvePending(key, image.id);
      } catch (caught) {
        editor.current?.resolvePending(key, null);
        notify(`${file.name}: ${errorMessage(caught)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function remove() {
    await flush();
    deleted.current = true;
    deleteTrace(traceId);
    navigate('/', { force: true, replace: true });
  }

  const loose = images.filter((image) => !embedded.current.has(image.id));
  const shownStatus = uploading > 0 && status === 'saved' ? 'waiting' : status;
  const label =
    uploading > 0 && status !== 'error'
      ? 'Uploading image…'
      : {
          saved: 'Saved',
          waiting: 'Editing…',
          saving: 'Saving…',
          invalid: form.body.trim() ? 'Choose a valid date' : 'Write something to keep this trace',
          error: 'Not saved',
        }[status];

  return (
    <article className="document">
      <div className="document-bar">
        <Link to="/" className="icon-link">
          <ArrowLeft size={16} aria-hidden="true" /> Back to traces
        </Link>
        <div className="document-tools">
          <span className={`save-state is-${shownStatus}`} role="status" aria-label={label}>
            {shownStatus === 'saved' && <Check size={14} aria-hidden="true" />} {label}
          </span>
          <ImageButton onFiles={(files) => void addFiles(files)} />
          <button type="button" className="icon-button" aria-label="Delete" title="Delete" onClick={() => void remove()}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {restoredDraft && <p className="restored" role="status">Restored your unsaved writing from this tab.</p>}
      {status === 'error' && <Notice onRetry={() => void flush()}>{saveError}</Notice>}

      <input
        className="document-date"
        type="date"
        aria-label="Date"
        required
        value={form.writtenOn}
        onChange={(event) => change({ writtenOn: event.target.value })}
      />
      <input
        className="document-title"
        type="text"
        aria-label="Title"
        placeholder="Add a title"
        maxLength={300}
        value={form.title}
        onChange={(event) => change({ title: event.target.value })}
      />
      <RichEditor
        ref={editor}
        label="Your writing"
        placeholder="Write, or type / for blocks…"
        initial={form.body}
        api={api}
        traceId={traceId}
        previews={previews.current}
        onChange={(markdown) => change({ body: withoutPendingImages(markdown) })}
        onSubmit={() => void flush()}
        onFiles={(files) => void addFiles(files)}
      />
      <LooseImages api={api} traceId={traceId} images={loose} onChange={setImages} />
      <TraceLinks
        api={api}
        traceId={traceId}
        links={links}
        startOpen={openLinks}
        onChange={setLinks}
        onRefresh={() => {
          void api.get(traceId).then((fresh) => setLinks(fresh.links), () => undefined);
        }}
      />
    </article>
  );
}

export function TraceView({ api, traceId }: { api: TracesApi; traceId: string }) {
  const { search, path, navigate } = useRouter();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openLinks] = useState(() => new URLSearchParams(search).has('link'));

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    api.get(traceId, controller.signal).then(setTrace, (caught) => {
      if (isAbort(caught)) return;
      setLoadError(caught instanceof ApiError ? caught : new ApiError(0, 'Network error'));
    });
    return () => controller.abort();
  }, [api, traceId, attempt]);

  useEffect(() => {
    if (new URLSearchParams(search).has('link')) navigate(path, { replace: true });
  }, [search, path, navigate]);

  if (loadError?.status === 404) {
    return (
      <div className="empty">
        <h1>Trace not found</h1>
        <p className="muted">It may have been deleted.</p>
        <Link to="/">Back to your traces</Link>
      </div>
    );
  }
  if (loadError) return <Notice onRetry={() => setAttempt((n) => n + 1)}>{errorMessage(loadError)}</Notice>;
  if (!trace) return <Loading />;
  return <TraceDocument api={api} loaded={trace} openLinks={openLinks} />;
}
