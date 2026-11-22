import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ConfirmDialog } from './traces/ui';

export const AUTH_ACTION_PATH = '/auth/action';

type Location = { path: string; search: string };
type NavigateOptions = { replace?: boolean; force?: boolean };

type Router = Location & {
  navigate(to: string, options?: NavigateOptions): void;
  /** Runs an action that would leave the page, asking first if there is unsaved work. */
  guard(action: () => void): void;
  setUnsaved(onDiscard: (() => void) | null): void;
};

const RouterContext = createContext<Router | null>(null);

// The reset code in this path's query must never be kept in router state or history.
function readLocation(): Location {
  const { pathname, search } = window.location;
  return { path: pathname, search: pathname === AUTH_ACTION_PATH ? '' : search };
}

const toUrl = ({ path, search }: Location) => `${path}${search}`;

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const current = useRef(toUrl(location));
  const discard = useRef<(() => void) | null>(null);

  const sync = useCallback(() => {
    const next = readLocation();
    current.current = toUrl(next);
    setLocation(next);
    document.documentElement.scrollTop = 0;
  }, []);

  const commit = useCallback(
    (to: string, replace = false) => {
      if (replace) window.history.replaceState(null, '', to);
      else window.history.pushState(null, '', to);
      sync();
    },
    [sync],
  );

  const guard = useCallback((action: () => void) => {
    if (discard.current) setPending(() => action);
    else action();
  }, []);

  const navigate = useCallback(
    (to: string, options: NavigateOptions = {}) => {
      if (options.force) discard.current = null;
      guard(() => commit(to, options.replace));
    },
    [commit, guard],
  );

  const setUnsaved = useCallback((onDiscard: (() => void) | null) => {
    discard.current = onDiscard;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (!discard.current) {
        sync();
        return;
      }
      // Browsers cannot cancel Back, so stay put and ask before going there.
      const target = `${window.location.pathname}${window.location.search}`;
      window.history.pushState(null, '', current.current);
      setPending(() => () => commit(target));
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (discard.current) event.preventDefault();
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [commit, sync]);

  const value = useMemo(
    () => ({ ...location, navigate, guard, setUnsaved }),
    [location, navigate, guard, setUnsaved],
  );

  return (
    <RouterContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          title="Leave without saving?"
          body="Your changes to this trace will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep writing"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const action = pending;
            discard.current?.();
            discard.current = null;
            setPending(null);
            action();
          }}
        />
      )}
    </RouterContext.Provider>
  );
}

export function useRouter(): Router {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter must be used inside RouterProvider');
  return value;
}

/** Marks the page as holding unsaved work for as long as `dirty` is true. */
export function useUnsavedGuard(dirty: boolean, onDiscard: () => void) {
  const { setUnsaved } = useRouter();
  const latest = useRef(onDiscard);
  latest.current = onDiscard;

  useEffect(() => {
    if (!dirty) return;
    setUnsaved(() => latest.current());
    return () => setUnsaved(null);
  }, [dirty, setUnsaved]);
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** A real anchor, so that opening in a new tab and keyboard use keep working. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
