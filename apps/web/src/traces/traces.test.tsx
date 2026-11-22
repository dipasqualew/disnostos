import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/client';
import { formatCalendarDate, localToday } from '../lib/dates';
import { RouterProvider } from '../router';
import { ApiError, createTracesApi, errorMessage, type Trace } from './api';
import { imageFileProblem, MAX_IMAGE_BYTES } from './TraceImages';
import { linkCandidates } from './TraceLinks';
import { dayLabel, groupByDay } from './TraceList';
import { UNDO_MS } from './toasts';
import { AUTOSAVE_MS } from './TraceView';

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
  it('groups by day and keeps order', () => {
    const groups = groupByDay([trace('a', '2026-02-02'), trace('b', '2026-02-02'), trace('c', '2026-01-31')]);
    expect(groups.map((g) => [g.day, g.traces.length])).toEqual([['2026-02-02', 2], ['2026-01-31', 1]]);
  });

  it('names recent days', () => {
    expect(dayLabel('2026-03-01', '2026-03-01')).toBe('Today');
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Yesterday');
    expect(dayLabel('2026-02-27', '2026-03-01')).toContain(formatCalendarDate('2026-02-27'));
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

const typeInto = async (text: string) => {
  const box = await screen.findByRole('textbox', { name: 'Your writing' });
  const { editor } = box as HTMLElement & { editor: { commands: { insertContent(value: string): void } } };
  act(() => editor.commands.insertContent(text));
  return box;
};

const emptyPage = { items: [], nextCursor: null };

describe('writing a trace', () => {
  it('defaults the date to the local day', async () => {
    stubFetch(() => Response.json(emptyPage));
    renderAt('/');
    expect(await screen.findByLabelText('Date')).toHaveValue(localToday());
  });

  it('sends the old new-trace address to the composer', async () => {
    stubFetch(() => Response.json(emptyPage));
    renderAt('/traces/new');
    await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('keeps the text when a post fails, then posts on retry and stays on the feed', async () => {
    let fail = true;
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        if (fail) return new Response('{}', { status: 500 });
        return Response.json(trace('t1', localToday(), null, 'dear diary'), { status: 201 });
      }
      return Response.json(emptyPage);
    });
    renderAt('/');
    const box = await typeInto('dear diary');
    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('could not complete');
    expect(box).toHaveTextContent('dear diary');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByRole('article', { name: 'dear diary' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveTextContent('');
  });

  it('uploads a pasted image after creating the trace, then embeds it', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const calls: { method: string; url: string; body?: string }[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (method === 'POST' && url.includes('/images')) {
        return Response.json({ id, traceId: 't1', title: 'p.png', mimeType: 'image/png', byteSize: 1, createdAt: '2026-01-01T00:00:00Z' }, { status: 201 });
      }
      if (method === 'POST') return Response.json(trace('t1', localToday(), null, 'words'), { status: 201 });
      if (method === 'PATCH') {
        const sent = JSON.parse(String(init?.body)) as { body: string };
        return Response.json(trace('t1', localToday(), null, sent.body));
      }
      if (url.includes('/images/')) return new Response(new Blob(['x']));
      return Response.json(emptyPage);
    });
    renderAt('/');
    await typeInto('words');
    const input = await screen.findByLabelText('Add image');
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true));
    const patch = calls.find((call) => call.method === 'PATCH')!;
    expect(patch.body).toContain(`trace-image:${id}`);
    expect(patch.body).not.toContain('pending-image');
    const create = calls.find((call) => call.method === 'POST' && !call.url.includes('/images'))!;
    expect(create.body).not.toContain('pending-image');
  });

  it('keeps the trace when an upload fails, and embeds the image on retry', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    let failUpload = true;
    let uploads = 0;
    const patches: string[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
    stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.includes('/images')) {
        uploads += 1;
        if (failUpload) return new Response('{}', { status: 500 });
        return Response.json({ id, traceId: 't1', title: 'p.png', mimeType: 'image/png', byteSize: 1, createdAt: '2026-01-01T00:00:00Z' }, { status: 201 });
      }
      if (method === 'POST') return Response.json(trace('t1', localToday(), null, 'kept words'), { status: 201 });
      if (method === 'PATCH') {
        patches.push(String(init?.body));
        const sent = JSON.parse(String(init?.body)) as { body: string };
        return Response.json({ ...trace('t1', localToday(), null, sent.body), updatedAt: '2026-01-02T00:00:00Z' });
      }
      if (url.includes('/images/')) return new Response(new Blob(['x']));
      if (url.includes('/traces/t1')) return Response.json(detail(trace('t1', localToday(), null, 'kept words')));
      return Response.json(emptyPage);
    });
    renderAt('/');
    await typeInto('kept words');
    fireEvent.change(await screen.findByLabelText('Add image'), {
      target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your trace is saved, but p.png did not upload.');
    expect(screen.getByRole('article', { name: 'kept words' })).toBeInTheDocument();
    expect(uploads).toBe(1);
    expect(patches).toEqual([]);

    failUpload = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    const sent = JSON.parse(patches[0]!) as { body: string };
    expect(sent.body).toBe(`kept words\n\n![p.png](trace-image:${id})`);
    expect(uploads).toBe(2);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
  });

  it('keeps composer writing when moving around, and asks before signing out', async () => {
    stubFetch(() => Response.json(emptyPage));
    renderAt('/');
    await typeInto('unsaved');
    await waitFor(() => expect(sessionStorage.getItem('disnostos:draft:u1:new')).toContain('unsaved'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave without saving?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }));
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveTextContent('unsaved');
  });

  it('restores writing after the page is rebuilt', async () => {
    stubFetch(() => Response.json(emptyPage));
    sessionStorage.setItem(
      'disnostos:draft:u1:new',
      JSON.stringify({ title: '', body: 'survived', writtenOn: '2026-01-02' }),
    );
    renderAt('/');
    expect(await screen.findByRole('textbox', { name: 'Your writing' })).toHaveTextContent('survived');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-02');
  });
});

describe('editing a trace', () => {
  afterEach(() => vi.useRealTimers());

  it('does not rewrite a trace that was only opened', async () => {
    const calls: string[] = [];
    stubFetch((_url, init) => {
      calls.push(init?.method ?? 'GET');
      return Response.json(detail(trace('t1', '2026-03-01', 'Title', 'a   \n\n\nb')));
    });
    renderAt('/traces/t1');
    await screen.findByRole('textbox', { name: 'Your writing' });
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_MS + 50));
    expect(calls).not.toContain('PATCH');
  });

  it('autosaves, and keeps the text when a save fails', async () => {
    let fail = true;
    const sent: string[] = [];
    stubFetch((_url, init) => {
      if (init?.method === 'PATCH') {
        sent.push(String(init.body));
        if (fail) return new Response('{}', { status: 500 });
        return Response.json(trace('t1', '2026-03-01', 'Title', 'words more'));
      }
      return Response.json(detail(trace('t1', '2026-03-01', 'Title', 'words')));
    });
    renderAt('/traces/t1');
    const box = await typeInto(' more');
    expect(await screen.findByRole('status', { name: 'Not saved' }, { timeout: AUTOSAVE_MS + 1000 })).toBeInTheDocument();
    expect(box).toHaveTextContent('more');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('status', { name: 'Saved' })).toBeInTheDocument();
    expect(sent.at(-1)).toContain('more');
  });
});

describe('reading a trace', () => {
  it('renders the body as text, not HTML', async () => {
    const body = '<img src=x onerror=alert(1)>\nsecond line';
    stubFetch(() => Response.json({ items: [trace('t1', '2026-03-01', 'Title', body)], nextCursor: null }));
    renderAt('/');
    const card = await screen.findByRole('article', { name: 'Title' });
    expect(card).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('br')).not.toBeNull();
  });

  it('shows a not-found page', async () => {
    stubFetch(() => Response.json({ error: 'Not Found' }, { status: 404 }));
    renderAt('/traces/missing');
    expect(await screen.findByRole('heading', { name: 'Trace not found' })).toBeInTheDocument();
  });

  it('deletes only after the undo window, and undo keeps the trace', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls: string[] = [];
    stubFetch((_url, init) => {
      calls.push(init?.method ?? 'GET');
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ items: [trace('t1', '2026-03-01', 'Ithaca')], nextCursor: null });
    });
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Ithaca' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Ithaca' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('article', { name: 'Ithaca' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS + 10));
    expect(calls).not.toContain('DELETE');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Ithaca' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS + 10));
    expect(calls).toContain('DELETE');
    vi.useRealTimers();
  });
});
