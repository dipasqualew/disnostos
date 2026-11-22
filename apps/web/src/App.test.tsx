import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import type { AuthClient, SessionUser } from './auth/client';
import { RESET_REQUESTED_MESSAGE } from './auth/screens';
import { RouterProvider } from './router';

const PASSWORD = 'a-long-enough-password';

function fakeClient(user: SessionUser | null = null) {
  let listener: (user: SessionUser | null) => void = () => undefined;
  const client = {
    subscribe: vi.fn((next: typeof listener) => {
      listener = next;
      next(user);
      return () => undefined;
    }),
    signIn: vi.fn(async () => listener({ uid: 'u1', email: 'user@example.com' })),
    signOut: vi.fn(async () => listener(null)),
    requestPasswordReset: vi.fn(async () => undefined),
    checkResetCode: vi.fn(async () => undefined),
    confirmReset: vi.fn(async () => undefined),
    getIdToken: vi.fn(async () => 'id-token'),
  } satisfies AuthClient;
  return client;
}

function renderApp(client: AuthClient, url = '/') {
  window.history.replaceState(null, '', url);
  return render(
    <AuthProvider client={client}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ items: [], nextCursor: null })),
  );
});

describe('sign in', () => {
  it('signs in, calls the API with the token, and signs out', async () => {
    const client = fakeClient();
    renderApp(client);
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();

    type('Email', 'user@example.com');
    type('Password', PASSWORD);
    click('Sign in');

    expect(await screen.findByText('Nothing written yet.')).toBeInTheDocument();
    expect(client.signIn).toHaveBeenCalledWith('user@example.com', PASSWORD);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/traces\?limit=20$/);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer id-token');

    click('Sign out');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('restores a persisted session', async () => {
    renderApp(fakeClient({ uid: 'u1', email: 'user@example.com' }));
    expect(await screen.findByText('user@example.com')).toBeInTheDocument();
  });

  it('shows one generic error for bad credentials', async () => {
    const client = fakeClient();
    client.signIn.mockRejectedValue({ code: 'auth/user-not-found' });
    renderApp(client);
    type('Email', 'user@example.com');
    type('Password', PASSWORD);
    click('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });
});

describe('forgot password', () => {
  it.each([
    ['succeeds', async () => undefined],
    ['fails', async () => Promise.reject({ code: 'auth/user-not-found' })],
  ])('shows the same message when the request %s', async (_name, implementation) => {
    const client = fakeClient();
    client.requestPasswordReset.mockImplementation(implementation);
    renderApp(client, '/forgot-password');
    type('Email', 'user@example.com');
    click('Send reset link');
    expect(await screen.findByRole('status')).toHaveTextContent(RESET_REQUESTED_MESSAGE);
  });
});

describe('reset password', () => {
  const url = '/auth/action?mode=resetPassword&oobCode=code-1';

  it('sets the password and removes the code from the URL', async () => {
    const client = fakeClient();
    renderApp(client, url);
    await screen.findByLabelText('New password');
    expect(window.location.search).toBe('');

    type('New password', PASSWORD);
    type('Confirm new password', PASSWORD);
    click('Set password');

    expect(await screen.findByText('Your password has been updated.')).toBeInTheDocument();
    expect(client.checkResetCode).toHaveBeenCalledWith('code-1');
    expect(client.confirmReset).toHaveBeenCalledWith('code-1', PASSWORD);
  });

  it('rejects mismatched passwords', async () => {
    const client = fakeClient();
    renderApp(client, url);
    await screen.findByLabelText('New password');
    type('New password', PASSWORD);
    type('Confirm new password', `${PASSWORD}x`);
    click('Set password');
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(client.confirmReset).not.toHaveBeenCalled();
  });

  it('explains an invalid link', async () => {
    const client = fakeClient();
    client.checkResetCode.mockRejectedValue({ code: 'auth/invalid-action-code' });
    renderApp(client, url);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('invalid or has expired'));
  });

  it('treats a missing code as invalid', () => {
    renderApp(fakeClient(), '/auth/action');
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or has expired');
  });
});
