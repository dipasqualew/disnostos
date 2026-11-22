import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/client';
import { localToday } from '../lib/dates';
import { RouterProvider } from '../router';
import { ApiError, createTracesApi, errorMessage, type Trace } from './api';
import { imageFileProblem, MAX_IMAGE_BYTES } from './TraceImages';
import { linkCandidates } from './TraceLinks';
import { groupByMonth } from './TraceList';

const trace = (id: string, writtenOn: string, title: string | null = id, body = 'words'): Trace => ({
  id,
  title,
  body,
  language: null,
  writtenOn,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const detail = (value: Trace) => ({ ...value, images: [], links: [] });

function fakeClient(): AuthClient {
  return {
    subscribe: (listener) => {
      listener({ uid: 'u1', email: 'user@example.com' });
      return () => undefined;
    },
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    checkResetCode: vi.fn(async () => undefined),
    confirmReset: vi.fn(async () => undefined),
    getIdToken: vi.fn(async () => 'token'),
  };
}

function renderAt(url: string, client = fakeClient()) {
  window.history.replaceState(null, '', url);
  render(
    <AuthProvider client={client}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>,
  );
  return client;
}

const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));

beforeEach(() => sessionStorage.clear());

describe('link candidates', () => {
  const traces = [trace('a', '2026-01-03', 'Ithaca'), trace('b', '2026-01-02', 'Thebes'), trace('c', '2026-01-01', null, 'the river')];

  it('excludes the trace itself and those already linked', () => {
    const links = [{ trace: { id: 'b', title: 'Thebes', writtenOn: '2026-01-02' } }];
    expect(linkCandidates(traces, 'a', links, '').map((t) => t.id)).toEqual(['c']);
  });

  it('searches title, body, and date', () => {
    expect(linkCandidates(traces, 'x', [], 'THEB').map((t) => t.id)).toEqual(['b']);
    expect(linkCandidates(traces, 'x', [], 'river').map((t) => t.id)).toEqual(['c']);
    expect(linkCandidates(traces, 'x', [], '2026-01-03').map((t) => t.id)).toEqual(['a']);
  });
});

describe('list helpers', () => {
  it('groups by month and keeps order', () => {
    const groups = groupByMonth([trace('a', '2026-02-02'), trace('b', '2026-02-01'), trace('c', '2026-01-31')]);
    expect(groups.map((g) => [g.month, g.traces.length])).toEqual([['2026-02', 2], ['2026-01', 1]]);
  });
});

describe('image checks', () => {
  it('rejects SVG and oversize files, and leaves an unknown type to the server', () => {
    expect(imageFileProblem({ name: 'a.svg', type: 'image/svg+xml', size: 1 })).toMatch(/not a supported/);
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/10 MB/);
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
    expect(imageFileProblem({ name: 'a', type: '', size: 1 })).toBeNull();
  });
});

describe('error messages', () => {
  it.each([
    [0, /connection/],
    [404, /not be found/],
    [409, /already linked/],
    [413, /10 MB/],
    [415, /supported image/],
    [500, /Try again/],
  ])('explains status %i', (status, pattern) => {
    expect(errorMessage(new ApiError(status, 'x'))).toMatch(pattern);
  });
});

describe('token refresh', () => {
  it('refreshes once and retries', async () => {
    const client = fakeClient();
    const responses = [new Response('{}', { status: 401 }), Response.json({ items: [], nextCursor: null })];
    stubFetch(() => responses.shift()!);
    await createTracesApi(client).list();
    expect(client.getIdToken).toHaveBeenCalledWith(true);
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it('signs out when the refreshed token is also rejected', async () => {
    const client = fakeClient();
    stubFetch(() => new Response('{}', { status: 401 }));
    await expect(createTracesApi(client).list()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.signOut).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    await expect(createTracesApi(fakeClient()).list()).rejects.toMatchObject({ status: 0 });
  });
});

describe('writing a trace', () => {
  it('defaults the date to the local day', async () => {
    stubFetch(() => Response.json({}));
    renderAt('/traces/new');
    expect(await screen.findByLabelText('Date')).toHaveValue(localToday());
  });

  it('keeps the text when a save fails, then saves on retry', async () => {
    let fail = true;
    stubFetch((url, init) => {
      if (init?.method === 'POST') {
        if (fail) return new Response('{}', { status: 500 });
        return Response.json(trace('t1', localToday(), null, 'dear diary'), { status: 201 });
      }
      return Response.json(detail(trace('t1', localToday(), null, 'dear diary')));
    });
    renderAt('/traces/new');
    fireEvent.change(await screen.findByLabelText('Your writing'), { target: { value: 'dear diary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not complete');
    expect(screen.getByLabelText('Your writing')).toHaveValue('dear diary');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(window.location.pathname).toBe('/traces/t1'));
    expect(await screen.findByText('dear diary')).toBeInTheDocument();
  });

  it('asks before leaving unsaved work and can stay', async () => {
    stubFetch(() => Response.json({ items: [], nextCursor: null }));
    renderAt('/traces/new');
    fireEvent.change(await screen.findByLabelText('Your writing'), { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('link', { name: 'disnostos' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave without saving?');
    expect(window.location.pathname).toBe('/traces/new');
    fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }));
    expect(screen.getByLabelText('Your writing')).toHaveValue('unsaved');
  });

  it('restores writing after the page is rebuilt', async () => {
    stubFetch(() => Response.json({}));
    sessionStorage.setItem(
      'disnostos:draft:u1:new',
      JSON.stringify({ title: '', body: 'survived', writtenOn: '2026-01-02' }),
    );
    renderAt('/traces/new');
    expect(await screen.findByLabelText('Your writing')).toHaveValue('survived');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-02');
  });
});

describe('reading a trace', () => {
  it('renders the body as text, not HTML', async () => {
    const body = '<img src=x onerror=alert(1)>\nsecond line';
    stubFetch(() => Response.json(detail(trace('t1', '2026-03-01', 'Title', body))));
    renderAt('/traces/t1');
    const node = await screen.findByText(/second line/);
    expect(node.textContent).toBe(body);
    expect(node.querySelector('img')).toBeNull();
  });

  it('shows a not-found page', async () => {
    stubFetch(() => Response.json({ error: 'Not Found' }, { status: 404 }));
    renderAt('/traces/missing');
    expect(await screen.findByRole('heading', { name: 'Trace not found' })).toBeInTheDocument();
  });

  it('confirms in the app before deleting', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(init?.method ?? 'GET');
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.includes('/traces?')) return Response.json({ items: [], nextCursor: null });
      return Response.json(detail(trace('t1', '2026-03-01')));
    });
    renderAt('/traces/t1');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(calls).not.toContain('DELETE');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete trace' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(calls).toContain('DELETE');
  });
});
