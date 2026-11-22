import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';

export const MIN_PASSWORD_LENGTH = 12;
export const RESET_REQUESTED_MESSAGE =
  'If an account exists for that email, a reset link is on its way.';

type Navigate = (path: string) => void;

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

function signInError(error: unknown): string {
  const code = errorCode(error);
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Network error. Try again.';
  return 'Incorrect email or password.';
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth">
      <p className="brand">disnostos</p>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="link" onClick={onClick}>
      {children}
    </button>
  );
}

export function SignIn({ navigate }: { navigate: Navigate }) {
  const { client } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.signIn(email.trim(), password);
    } catch (caught) {
      setError(signInError(caught));
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <LinkButton onClick={() => navigate('/forgot-password')}>Forgot your password?</LinkButton>
    </Card>
  );
}

export function ForgotPassword({ navigate }: { navigate: Navigate }) {
  const { client } = useAuth();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    // The outcome is never shown, so this page cannot reveal whether an account exists.
    await client.requestPasswordReset(email.trim()).catch(() => undefined);
    setBusy(false);
    setDone(true);
  }

  return (
    <Card title="Reset your password">
      {done ? (
        <p role="status">{RESET_REQUESTED_MESSAGE}</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <LinkButton onClick={() => navigate('/')}>Back to sign in</LinkButton>
    </Card>
  );
}

type ResetState = 'checking' | 'ready' | 'invalid' | 'done';

export function ResetPassword({ code, navigate }: { code: string | null; navigate: Navigate }) {
  const { client } = useAuth();
  const [state, setState] = useState<ResetState>(code ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    let active = true;
    client.checkResetCode(code).then(
      () => active && setState('ready'),
      () => active && setState('invalid'),
    );
    return () => {
      active = false;
    };
  }, [client, code]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.confirmReset(code!, password);
      setState('done');
    } catch (caught) {
      const code = errorCode(caught);
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        setState('invalid');
      } else {
        setError('Could not set the password. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Set a new password">
      {state === 'checking' && <p role="status">Checking your link…</p>}
      {state === 'invalid' && (
        <>
          <p className="error" role="alert">This reset link is invalid or has expired.</p>
          <LinkButton onClick={() => navigate('/forgot-password')}>Request a new link</LinkButton>
        </>
      )}
      {state === 'ready' && (
        <form onSubmit={submit}>
          <label>
            New password
            <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Confirm new password
            <input type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
        </form>
      )}
      {state === 'done' && (
        <>
          <p role="status">Your password has been updated.</p>
          <LinkButton onClick={() => navigate('/')}>Continue to sign in</LinkButton>
        </>
      )}
    </Card>
  );
}
