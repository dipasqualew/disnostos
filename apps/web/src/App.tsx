import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import { ForgotPassword, ResetPassword, SignIn } from './auth/screens';
import { AUTH_ACTION_PATH, Link, useRouter } from './router';
import { createTracesApi, type TracesApi } from './traces/api';
import { clearAllDrafts } from './traces/drafts';
import { TraceList } from './traces/TraceList';
import { ToastProvider, useToasts } from './traces/toasts';
import { TraceView } from './traces/TraceView';
import { LogOut } from 'lucide-react';

export { AUTH_ACTION_PATH };

const FORGOT_PASSWORD_PATH = '/forgot-password';

/** Reads the reset code once and removes it from the URL and browser history. */
function takeResetCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('mode') === 'resetPassword' ? params.get('oobCode') : null;
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  return code;
}

type Route =
  | { name: 'list' }
  | { name: 'view'; id: string }
  | { name: 'redirect'; to: string }
  | { name: 'missing' };

export function matchRoute(path: string): Route {
  if (path === '/') return { name: 'list' };
  // Writing now starts on the home page, and every trace page is editable.
  if (path === '/traces/new') return { name: 'redirect', to: '/' };
  const match = /^\/traces\/([^/]+)(\/edit)?\/?$/.exec(path);
  if (!match) return { name: 'missing' };
  return match[2] ? { name: 'redirect', to: `/traces/${match[1]!}` } : { name: 'view', id: match[1]! };
}

function Page({ api, route }: { api: TracesApi; route: Route }) {
  switch (route.name) {
    case 'list':
      return <TraceList api={api} />;
    case 'view':
      return <TraceView key={route.id} api={api} traceId={route.id} />;
    case 'redirect':
      return null;
    case 'missing':
      return (
        <>
          <h1>Page not found</h1>
          <Link to="/">Back to your traces</Link>
        </>
      );
  }
}

function Journal() {
  const { client } = useAuth();
  const api = useMemo(() => createTracesApi(client), [client]);
  return (
    <ToastProvider api={api}>
      <JournalShell api={api} />
    </ToastProvider>
  );
}

function JournalShell({ api }: { api: TracesApi }) {
  const { client, user } = useAuth();
  const { path, navigate, guard } = useRouter();
  const { flushDeletes } = useToasts();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const route = matchRoute(path);
  const redirectTo = route.name === 'redirect' ? route.to : null;

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo, navigate]);

  // Moves keyboard and screen reader users to the new page's content.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
  }, [path]);

  useEffect(() => {
    if (path === FORGOT_PASSWORD_PATH) navigate('/', { replace: true });
  }, [path, navigate]);

  function signOut() {
    guard(
      () => {
        clearAllDrafts();
        navigate('/', { force: true, replace: true });
        // Deletes still in their undo window need this session's token.
        void flushDeletes().finally(() => client.signOut());
      },
      { includeHeld: true },
    );
  }

  return (
    <div className="journal">
      <a className="skip" href="#content">Skip to content</a>
      <header className="masthead">
        <Link to="/" className="wordmark">disnostos</Link>
        <nav aria-label="Account">
          <span className="account">{user?.email}</span>
          <button type="button" className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" />
          </button>
        </nav>
      </header>
      <main id="content" ref={main} tabIndex={-1} className="page">
        <Page api={api} route={route} />
      </main>
    </div>
  );
}

export function App() {
  const { user } = useAuth();
  const { path, search, navigate } = useRouter();
  const [resetCode] = useState(() =>
    window.location.pathname === AUTH_ACTION_PATH ? takeResetCode() : null,
  );
  // Where a signed-out visitor was heading, kept through the forgot-password detour.
  const returnTo = useRef('/');
  if (!user && path !== FORGOT_PASSWORD_PATH && path !== AUTH_ACTION_PATH) {
    returnTo.current = `${path}${search}`;
  }

  // The reset page works whether or not someone is signed in on this browser.
  if (path === AUTH_ACTION_PATH) return <ResetPassword code={resetCode} navigate={navigate} />;

  if (user === undefined) {
    return (
      <main>
        <p className="status" role="status">Loading…</p>
      </main>
    );
  }
  if (user) return <Journal />;

  const authNavigate = (to: string) => navigate(to === '/' ? returnTo.current : to);
  if (path === FORGOT_PASSWORD_PATH) return <ForgotPassword navigate={authNavigate} />;
  return <SignIn navigate={authNavigate} />;
}
