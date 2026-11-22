import { ArrowUp, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { isCalendarDate, localToday } from '../lib/dates';
import { useRouter, useUnsavedGuard } from '../router';
import { errorMessage, type Trace, type TracesApi } from './api';
import { clearDraft, loadDraft, saveDraft } from './drafts';
import { PENDING_SCHEME, imageSrc, replacePendingImage, withoutPendingImages } from './markdown';
import { ImageButton, RichEditor, type Previews, type RichEditorHandle } from './TraceEditor';
import { imageFileProblem } from './TraceImages';

const isMac = () => /mac/i.test(navigator.platform);
const hasFinePointer = () => window.matchMedia?.('(pointer: fine)').matches ?? false;
const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const pendingKeys = (body: string) =>
  [...body.matchAll(new RegExp(`\\(${PENDING_SCHEME}([^)]+)\\)`, 'g'))].map((match) => match[1]!);

type FailedUpload = { trace: Trace; files: File[] };

export function Composer({ api, onPosted }: { api: TracesApi; onPosted(trace: Trace): void }) {
  const { user } = useAuth();
  const { setHeld } = useRouter();
  const uid = user?.uid ?? '';
  const [draft] = useState(() => loadDraft(uid, null));
  const [title, setTitle] = useState(draft?.title ?? '');
  const [showTitle, setShowTitle] = useState(Boolean(draft?.title));
  const [writtenOn, setWrittenOn] = useState(draft?.writtenOn ?? localToday());
  const [body, setBody] = useState(draft?.body ?? '');
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<FailedUpload | null>(null);
  const editor = useRef<RichEditorHandle>(null);
  const previews = useRef<Previews>(new Map());

  const hasPending = pendingKeys(body).length > 0;
  const hasWriting = Boolean(withoutPendingImages(body) || title.trim());
  const canPost = hasPending || Boolean(withoutPendingImages(body));

  useEffect(() => {
    if (hasWriting) saveDraft(uid, null, { title, body: withoutPendingImages(body), writtenOn });
    else clearDraft(uid, null);
  }, [body, hasWriting, title, uid, writtenOn]);

  // Text is kept in the tab's draft, so moving around the app never interrupts anyone.
  useEffect(() => {
    if (!hasWriting) return;
    setHeld(() => clearDraft(uid, null));
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setHeld(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasWriting, setHeld, uid]);

  // Image files cannot be kept in a draft, so leaving with them does need a question.
  useUnsavedGuard(hasPending, () => clearDraft(uid, null));

  useEffect(() => {
    if (hasFinePointer()) editor.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      if (event.key === 'n' || event.key === '/') {
        event.preventDefault();
        editor.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const held = previews.current;
    return () => {
      held.forEach((preview) => URL.revokeObjectURL(preview.url));
      held.clear();
    };
  }, []);

  function addFiles(files: File[]) {
    const problems: string[] = [];
    for (const file of files) {
      const problem = imageFileProblem(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      const key = crypto.randomUUID();
      previews.current.set(key, { url: URL.createObjectURL(file), file });
      editor.current?.insertPending(key, file.name);
    }
    setError(problems.length ? problems.join(' ') : null);
  }

  async function attach(trace: Trace, startBody: string, uploads: { key: string; file: File }[]) {
    let next = startBody;
    let uploaded = 0;
    const missed: File[] = [];
    for (const { key, file } of uploads) {
      try {
        const image = await api.addImage(trace.id, file);
        next = replacePendingImage(next, key, image.id);
        uploaded += 1;
      } catch {
        next = replacePendingImage(next, key, null);
        missed.push(file);
      }
    }
    const finalBody = next.replace(/\n{3,}/g, '\n\n').trim();
    if (uploaded > 0 && finalBody) {
      onPosted(await api.update(trace.id, { title: trace.title, body: finalBody, writtenOn: trace.writtenOn }));
    }
    setFailed(missed.length ? { trace, files: missed } : null);
  }

  async function post() {
    if (busy) return;
    const markdown = editor.current?.markdown() ?? body;
    const words = withoutPendingImages(markdown);
    const keys = pendingKeys(markdown);
    if (!words && keys.length === 0) {
      editor.current?.focus();
      return;
    }
    if (!isCalendarDate(writtenOn)) {
      setError('Choose a valid date.');
      return;
    }
    const uploads = keys.flatMap((key) => {
      const preview = previews.current.get(key);
      return preview ? [{ key, file: preview.file }] : [];
    });
    setBusy(true);
    setError(null);
    try {
      // The API needs words to create a trace; an image-only one starts with its file names.
      const firstBody = words || uploads.map(({ file }) => file.name).join(', ');
      const trace = await api.create({ title: title.trim() || null, body: firstBody, writtenOn });
      clearDraft(uid, null);
      onPosted(trace);
      setTitle('');
      setShowTitle(false);
      setBody('');
      setWrittenOn(localToday());
      setEditorKey((n) => n + 1);
      setBusy(false);
      queueMicrotask(() => editor.current?.focus());
      if (uploads.length) await attach(trace, markdown, uploads);
      uploads.forEach(({ key }) => {
        const preview = previews.current.get(key);
        if (preview) URL.revokeObjectURL(preview.url);
        previews.current.delete(key);
      });
    } catch (caught) {
      // Everything stays in the composer, exactly as typed.
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function retryFailed() {
    if (!failed) return;
    const { trace, files } = failed;
    setBusy(true);
    setError(null);
    try {
      const current = await api.get(trace.id);
      const missed: File[] = [];
      const embeds: string[] = [];
      for (const file of files) {
        try {
          const image = await api.addImage(trace.id, file);
          embeds.push(`![${file.name.replace(/[\\[\]]/g, '\\$&')}](${imageSrc(image.id)})`);
        } catch {
          missed.push(file);
        }
      }
      if (embeds.length) {
        const nextBody = [current.body, ...embeds].join('\n\n');
        onPosted(await api.update(trace.id, { title: current.title, body: nextBody, writtenOn: current.writtenOn }));
      }
      setFailed(missed.length ? { trace, files: missed } : null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="composer" aria-label="Write a trace">
      {showTitle && (
        <input
          className="composer-title"
          type="text"
          aria-label="Title"
          placeholder="Title"
          autoFocus
          maxLength={300}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      )}
      <RichEditor
        key={editorKey}
        ref={editor}
        label="Your writing"
        placeholder="What’s on your mind? A verse, a link, a thought…"
        initial={editorKey === 0 ? (draft?.body ?? '') : ''}
        api={api}
        traceId={null}
        previews={previews.current}
        onChange={setBody}
        onSubmit={() => void post()}
        onFiles={addFiles}
      />
      {error && <p className="error" role="alert">{error}</p>}
      {failed && (
        <div className="notice" role="alert">
          <p>
            Your trace is saved, but {failed.files.length === 1 ? failed.files[0]!.name : `${failed.files.length} images`} did not upload.
          </p>
          <span className="notice-actions">
            <button type="button" className="quiet" disabled={busy} onClick={() => void retryFailed()}>Try again</button>
            <button type="button" className="text-button" onClick={() => setFailed(null)}>Dismiss</button>
          </span>
        </div>
      )}
      <div className="composer-bar">
        <div className="composer-tools">
          <input
            className="date-chip"
            type="date"
            aria-label="Date"
            required
            value={writtenOn}
            onChange={(event) => setWrittenOn(event.target.value)}
          />
          <ImageButton onFiles={addFiles} />
          {!showTitle && (
            <button type="button" className="chip" onClick={() => setShowTitle(true)}>
              <Type size={14} aria-hidden="true" /> Add title
            </button>
          )}
        </div>
        <div className="composer-send">
          <kbd aria-hidden="true">{isMac() ? '⌘' : 'Ctrl'} ↵</kbd>
          <button type="button" className="post-button" disabled={busy || !canPost} onClick={() => void post()}>
            <ArrowUp size={16} aria-hidden="true" /> {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </section>
  );
}
