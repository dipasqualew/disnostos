import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, matchRoute } from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient } from '../auth/client';
import { RouterProvider } from '../router';
import type { MythFull } from './api';
import { Compare } from './Compare';

const times = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const MYTH = ID(1);
const ONE = ID(2);
const TWO = ID(3);
const BEAT_A = ID(4);
const BEAT_B = ID(5);
const WORD_A = ID(6);
const WORD_B = ID(7);
const ROW_A = ID(8);
const ROW_B = ID(9);

const word = (id: string, beatId: string, text: string) => ({
  ...times,
  id,
  beatId,
  language: 'en',
  text,
  translatedFromId: null,
  promotedFromTraceId: null,
  forkedFromId: null,
});

const fixture = (): MythFull => ({
  myth: { ...times, id: MYTH, title: 'The Bridge', summary: null, forkedFromId: null },
  beats: [
    { ...times, id: BEAT_A, mythId: MYTH, label: 'They meet', forkedFromId: null, wordings: [word(WORD_A, BEAT_A, 'They meet at the bridge.')] },
    { ...times, id: BEAT_B, mythId: MYTH, label: 'They part', forkedFromId: null, wordings: [word(WORD_B, BEAT_B, 'They part at dawn.')] },
  ],
  versions: [
    {
      ...times,
      id: ONE,
      mythId: MYTH,
      title: 'River telling',
      description: null,
      forkedFromId: null,
      traditionIds: [],
      mythologyIds: [],
      beats: [
        { ...times, id: ROW_A, versionId: ONE, beatId: BEAT_A, wordingId: WORD_A, position: 1, note: null },
        { ...times, id: ROW_B, versionId: ONE, beatId: BEAT_B, wordingId: null, position: 2, note: null },
      ],
    },
    {
      ...times,
      id: TWO,
      mythId: MYTH,
      title: 'Hill telling',
      description: null,
      forkedFromId: null,
      traditionIds: [],
      mythologyIds: [],
      beats: [{ ...times, id: ID(0), versionId: TWO, beatId: BEAT_A, wordingId: WORD_A, position: 1, note: null }],
    },
  ],
  traditions: [],
  mythologies: [],
});

function client(): AuthClient {
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

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  render(
    <AuthProvider client={client()}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>,
  );
}

type Handler = (url: string, init?: RequestInit) => Response | undefined | Promise<Response>;

/** Serves the fixture, letting each test answer the requests it is about. */
function stubApi(handler: Handler = () => undefined, data = fixture()) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? 'GET';
      if (method !== 'GET') calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      const handled = await handler(path, init);
      if (handled) return handled;
      if (path === `/myths/${MYTH}/full`) return Response.json(data);
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  return calls;
}

const passage = (name: RegExp | string) => screen.findByRole('group', { name });

beforeEach(() => sessionStorage.clear());

describe('routes', () => {
  it('matches the narrative pages', () => {
    expect(matchRoute('/myths')).toEqual({ name: 'myths' });
    expect(matchRoute('/myths/abc')).toEqual({ name: 'myth', id: 'abc' });
    expect(matchRoute('/traditions/abc')).toEqual({ name: 'collection', kind: 'tradition', id: 'abc' });
    expect(matchRoute('/mythologies/abc')).toEqual({ name: 'collection', kind: 'mythology', id: 'abc' });
  });
});

describe('library', () => {
  it('creates a myth with its first variation in one step and opens it', async () => {
    const calls = stubApi((path, init) => {
      if (path === '/myths' && init?.method === 'POST') {
        return Response.json({ myth: fixture().myth, version: fixture().versions[0] }, { status: 201 });
      }
      return undefined;
    });
    renderAt('/myths');
    const field = await screen.findByRole('textbox', { name: 'New myth title' });
    fireEvent.change(field, { target: { value: 'The Bridge' } });
    fireEvent.submit(field.closest('form')!);
    await screen.findByRole('group', { name: 'Passage 1: They meet' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/myths', body: { title: 'The Bridge', version: { title: 'First telling' } } });
    expect(window.location.search).toBe(`?version=${ONE}`);
  });
});

describe('reading a telling', () => {
  it('renders the wordings in order, one passage per beat', async () => {
    stubApi();
    renderAt(`/myths/${MYTH}?version=${ONE}`);
    expect(await passage('Passage 1: They meet')).toHaveTextContent('They meet at the bridge.');
    expect(await passage('Passage 2: They part')).toHaveTextContent('They part at dawn.');
  });

  it('marks a wording borrowed from the pool', async () => {
    stubApi();
    renderAt(`/myths/${MYTH}?version=${ONE}`);
    expect(await passage('Passage 2: They part')).toHaveTextContent('wording not chosen');
  });

  it('invites writing when a beat has no wording', async () => {
    const data = fixture();
    data.beats[1]!.wordings = [];
    stubApi(undefined, data);
    renderAt(`/myths/${MYTH}?version=${ONE}`);
    expect(await screen.findByRole('button', { name: 'Write this passage: They part' })).toBeInTheDocument();
  });

  it('follows the deep link to a variation', async () => {
    stubApi();
    renderAt(`/myths/${MYTH}?version=${TWO}`);
    expect(await passage('Passage 1: They meet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Passage 2: They part' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hill telling' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows on the map which beats this telling leaves out', async () => {
    stubApi();
    renderAt(`/myths/${MYTH}?version=${TWO}`);
    expect(await screen.findByRole('button', { name: 'They part: left out of this variation' })).toBeInTheDocument();
  });

  it('compares two tellings aligned by beat', async () => {
    stubApi();
    renderAt(`/myths/${MYTH}?version=${ONE}&compare=${TWO}`);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /They meet/ })).toHaveTextContent('Same words');
    expect(screen.getByRole('cell', { name: 'Not in Hill telling' })).toBeInTheDocument();
  });
});

describe('comparing', () => {
  it('says a moved beat is told elsewhere, not that it is missing', () => {
    const full = fixture();
    const [river, hill] = full.versions as [MythFull['versions'][number], MythFull['versions'][number]];
    hill.beats = [
      { ...times, id: ID(0), versionId: TWO, beatId: BEAT_B, wordingId: WORD_B, position: 1, note: null },
      { ...times, id: `${ID(0)}a`, versionId: TWO, beatId: BEAT_A, wordingId: WORD_A, position: 2, note: null },
    ];
    render(<Compare full={full} left={river} right={hill} />);

    const moved = screen.getAllByRole('row').filter((row) => within(row).queryByText('Told at another point'));
    expect(moved).toHaveLength(2);
    expect(screen.getByRole('cell', { name: 'Told at another point in Hill telling' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Told at another point in River telling' })).toBeInTheDocument();
    expect(screen.queryByText(/^Not in /)).not.toBeInTheDocument();
  });
});

describe('writing', () => {
  const created = (n: number) => ({
    beat: { ...times, id: ID(n), mythId: MYTH, label: 'x', forkedFromId: null },
    wording: word(`10000000-0000-4000-8000-00000000000${n}`, ID(n), 'x'),
    versionBeat: { ...times, id: `20000000-0000-4000-8000-00000000000${n}`, versionId: TWO, beatId: ID(n), wordingId: null, position: 9, note: null },
  });

  it('turns a typed passage into a beat with a derived label', async () => {
    const calls = stubApi((path, init) =>
      path === `/myths/${MYTH}/beats` && init?.method === 'POST' ? Response.json(created(1), { status: 201 }) : undefined,
    );
    renderAt(`/myths/${MYTH}?version=${TWO}`);
    const box = await screen.findByRole('textbox', { name: 'Next passage' });
    fireEvent.change(box, { target: { value: 'The bridge falls. Nobody speaks.' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box).toHaveValue('');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      label: 'The bridge falls',
      wording: { language: 'en', text: 'The bridge falls. Nobody speaks.' },
      versionId: TWO,
    });
  });

  it('splits pasted paragraphs into one beat each, in order', async () => {
    let n = 0;
    const calls = stubApi((path, init) =>
      path === `/myths/${MYTH}/beats` && init?.method === 'POST'
        ? Response.json(created(++n), { status: 201 })
        : undefined,
    );
    renderAt(`/myths/${MYTH}?version=${TWO}`);
    const box = await screen.findByRole('textbox', { name: 'Next passage' });
    fireEvent.change(box, { target: { value: 'First part.\n\nSecond part.' } });
    expect(screen.getByText('2 passages, one beat each')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((call) => (call.body as { label: string }).label)).toEqual(['First part', 'Second part']);
  });

  it('rolls back and returns the text when saving fails', async () => {
    let fail: (response: Response) => void = () => undefined;
    const failure = new Promise<Response>((resolve) => {
      fail = resolve;
    });
    stubApi((path, init) =>
      path === `/myths/${MYTH}/beats` && init?.method === 'POST' ? failure : undefined,
    );
    renderAt(`/myths/${MYTH}?version=${TWO}`);
    const box = await screen.findByRole('textbox', { name: 'Next passage' });
    fireEvent.change(box, { target: { value: 'A lost line.' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByRole('group', { name: 'Passage 2: A lost line' })).toBeInTheDocument();
    fail(Response.json({ error: 'Nope' }, { status: 500 }));
    await waitFor(() => expect(box).toHaveValue('A lost line.'));
    expect(screen.queryByRole('group', { name: 'Passage 2: A lost line' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Could not save that passage/)).toBeInTheDocument();
  });

  it('reorders from the keyboard using the row it should follow', async () => {
    const calls = stubApi((path, init) =>
      init?.method === 'PATCH' ? Response.json(fixture().versions[0]!.beats[0]) : undefined,
    );
    renderAt(`/myths/${MYTH}?version=${ONE}`);
    const tag = await screen.findByRole('button', { name: 'Beat 2: They part' });
    fireEvent.keyDown(tag, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: `/versions/${ONE}/beats/${ROW_B}`, body: { afterId: null } });
  });

  it('explains a beat in use and offers removal from this variation', async () => {
    const calls = stubApi((path, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined,
    );
    renderAt(`/myths/${MYTH}?version=${ONE}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Beat 1: They meet' }));
    const panel = await screen.findByRole('complementary', { name: 'Beat details' });
    expect(within(panel).getByRole('link', { name: 'Hill telling' })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete beat' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'This beat is still in use' });
    expect(dialog).toHaveTextContent('River telling, Hill telling');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from this variation' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: `/versions/${ONE}/beats/${ROW_A}` });
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});
