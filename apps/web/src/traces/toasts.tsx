import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage, type TracesApi } from './api';

export const UNDO_MS = 5000;

type Toast = { id: number; message: string; action?: { label: string; run(): void } };
type PendingDelete = { timer: ReturnType<typeof setTimeout>; toastId: number };

type Toasts = {
  notify(message: string): void;
  /** Hides a trace now and deletes it when the undo window ends. */
  deleteTrace(id: string): void;
  /** Sends every waiting delete now, for when the session is about to end. */
  flushDeletes(): Promise<void>;
  deleting: ReadonlySet<string>;
  /** Registers a save still in flight, so the next page can wait and read fresh data. */
  trackSave(save: Promise<unknown>): void;
  savesSettled(): Promise<void>;
};

const ToastContext = createContext<Toasts | null>(null);

export function ToastProvider({ api, children }: { api: TracesApi; children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, PendingDelete>());
  const nextId = useRef(1);
  const saves = useRef(new Set<Promise<unknown>>());

  const trackSave = useCallback((save: Promise<unknown>) => {
    const settled = save.catch(() => undefined).finally(() => saves.current.delete(settled));
    saves.current.add(settled);
  }, []);

  const savesSettled = useCallback(async () => {
    await Promise.all(saves.current);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, action?: Toast['action'], duration: number | null = 4000) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, action }]);
      if (duration !== null) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const restore = useCallback((id: string) => {
    setDeleting((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const send = useCallback(
    async (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.current.delete(id);
      dismiss(entry.toastId);
      try {
        await api.remove(id);
      } catch (caught) {
        restore(id);
        push(`Could not delete that trace. ${errorMessage(caught)}`);
      }
    },
    [api, dismiss, push, restore],
  );

  const deleteTrace = useCallback(
    (id: string) => {
      if (pending.current.has(id)) return;
      setDeleting((current) => new Set(current).add(id));
      const toastId = push(
        'Trace deleted',
        {
          label: 'Undo',
          run: () => {
            const entry = pending.current.get(id);
            if (!entry) return;
            clearTimeout(entry.timer);
            pending.current.delete(id);
            dismiss(entry.toastId);
            restore(id);
          },
        },
        null,
      );
      pending.current.set(id, { toastId, timer: setTimeout(() => void send(id), UNDO_MS) });
    },
    [dismiss, push, restore, send],
  );

  const flushDeletes = useCallback(async () => {
    await Promise.all([...pending.current.keys()].map(send));
  }, [send]);

  useEffect(() => {
    const waiting = pending.current;
    return () => waiting.forEach((entry) => clearTimeout(entry.timer));
  }, []);

  const value = useMemo(
    () => ({
      notify: (message: string) => void push(message),
      deleteTrace,
      flushDeletes,
      deleting,
      trackSave,
      savesSettled,
    }),
    [push, deleteTrace, flushDeletes, deleting, trackSave, savesSettled],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>{toast.message}</span>
            {toast.action && (
              <button type="button" className="text-button" onClick={toast.action.run}>
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): Toasts {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToasts must be used inside ToastProvider');
  return value;
}
