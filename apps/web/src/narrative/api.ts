import type { AuthClient } from '../auth/client';
import { ApiError, createRequester, errorMessage } from '../traces/api';

type Row = { id: string; createdAt: string; updatedAt: string };

export type Myth = Row & { title: string; summary: string | null; forkedFromId: string | null };
export type Beat = Row & { mythId: string; label: string; forkedFromId: string | null };
export type Wording = Row & {
  beatId: string;
  language: string;
  text: string;
  translatedFromId: string | null;
  promotedFromTraceId: string | null;
  forkedFromId: string | null;
};
/** The API's Version. People see this as a "variation". */
export type Version = Row & {
  mythId: string;
  title: string;
  description: string | null;
  forkedFromId: string | null;
};
export type VersionBeat = Row & {
  versionId: string;
  beatId: string;
  wordingId: string | null;
  position: number;
  note: string | null;
};
export type Tradition = Row & { name: string; description: string | null };
export type Mythology = Row & { name: string; description: string | null };

export type PoolBeat = Beat & { wordings: Wording[] };
export type FullVersion = Version & {
  beats: VersionBeat[];
  traditionIds: string[];
  mythologyIds: string[];
};
export type FullTradition = Tradition & { mythologyIds: string[] };
export type MythFull = {
  myth: Myth;
  beats: PoolBeat[];
  versions: FullVersion[];
  traditions: FullTradition[];
  mythologies: Mythology[];
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type BeatInUse = { versions: { id: string; title: string }[]; versionBeatIds: string[] };
export type CollectionKind = 'tradition' | 'mythology';

type Auth = Pick<AuthClient, 'getIdToken' | 'signOut'>;
const at = (...parts: string[]) => `/${parts.map(encodeURIComponent).join('/')}`;

export function createNarrativeApi(auth: Auth) {
  const { send, json, withJson } = createRequester(auth);
  const post = <T>(path: string, body: unknown) => json<T>(path, withJson('POST', body));
  const patch = <T>(path: string, body: unknown) => json<T>(path, withJson('PATCH', body));
  const remove = async (path: string) => {
    await send(path, { method: 'DELETE' });
  };

  /** Follows every page, for pickers that search a whole collection. */
  async function all<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const page: Page<T> = await json<Page<T>>(`${path}?limit=100${suffix}`, { signal });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  return {
    listMyths: (cursor?: string | null, signal?: AbortSignal) =>
      json<Page<Myth>>(`/myths?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
    createMyth: (input: { title: string; summary?: string; version?: { title: string } }) =>
      post<{ myth: Myth; version: Version | null }>('/myths', input),
    getMyth: (id: string, signal?: AbortSignal) => json<Myth>(at('myths', id), { signal }),
    full: (id: string, signal?: AbortSignal) => json<MythFull>(at('myths', id, 'full'), { signal }),
    updateMyth: (id: string, input: { title?: string; summary?: string | null }) =>
      patch<Myth>(at('myths', id), input),
    deleteMyth: (id: string) => remove(at('myths', id)),

    createBeat: (
      mythId: string,
      input: {
        label: string;
        wording?: { language: string; text: string };
        versionId?: string;
        afterVersionBeatId?: string | null;
        note?: string;
      },
    ) =>
      post<{ beat: Beat; wording: Wording | null; versionBeat: VersionBeat | null }>(
        at('myths', mythId, 'beats'),
        input,
      ),
    updateBeat: (id: string, input: { label: string }) => patch<Beat>(at('beats', id), input),
    deleteBeat: (id: string) => remove(at('beats', id)),

    createWording: (beatId: string, input: { language: string; text: string; translatedFromId?: string }) =>
      post<Wording>(at('beats', beatId, 'wordings'), input),
    updateWording: (id: string, input: { language?: string; text?: string }) =>
      patch<Wording>(at('wordings', id), input),
    deleteWording: (id: string) => remove(at('wordings', id)),

    createVersion: (mythId: string, input: { title: string; description?: string; traditionId?: string }) =>
      post<{ version: Version; traditionVersion: unknown }>(at('myths', mythId, 'versions'), input),
    getVersion: (id: string, signal?: AbortSignal) => json<Version>(at('versions', id), { signal }),
    updateVersion: (id: string, input: { title?: string; description?: string | null }) =>
      patch<Version>(at('versions', id), input),
    deleteVersion: (id: string) => remove(at('versions', id)),

    addVersionBeat: (
      versionId: string,
      input: { beatId: string; wordingId?: string | null; note?: string | null; afterId?: string | null },
    ) => post<VersionBeat>(at('versions', versionId, 'beats'), input),
    updateVersionBeat: (
      versionId: string,
      id: string,
      input: { wordingId?: string | null; note?: string | null; afterId?: string | null },
    ) => patch<VersionBeat>(at('versions', versionId, 'beats', id), input),
    removeVersionBeat: (versionId: string, id: string) => remove(at('versions', versionId, 'beats', id)),

    allTraditions: (signal?: AbortSignal) => all<Tradition>('/traditions', signal),
    createTradition: (input: { name: string; mythologyId?: string; versionId?: string }) =>
      post<{ tradition: Tradition }>('/traditions', input),
    getTradition: (id: string, signal?: AbortSignal) =>
      json<Tradition & { versionIds: string[]; mythologyIds: string[] }>(at('traditions', id), { signal }),
    updateTradition: (id: string, input: { name?: string; description?: string | null }) =>
      patch<Tradition>(at('traditions', id), input),
    deleteTradition: (id: string) => remove(at('traditions', id)),
    addToTradition: (traditionId: string, versionId: string) =>
      post<unknown>(at('traditions', traditionId, 'versions'), { versionId }),
    removeFromTradition: (traditionId: string, versionId: string) =>
      remove(at('traditions', traditionId, 'versions', versionId)),

    allMythologies: (signal?: AbortSignal) => all<Mythology>('/mythologies', signal),
    createMythology: (input: { name: string }) => post<Mythology>('/mythologies', input),
    getMythology: (id: string, signal?: AbortSignal) =>
      json<Mythology & { traditionIds: string[] }>(at('mythologies', id), { signal }),
    updateMythology: (id: string, input: { name?: string; description?: string | null }) =>
      patch<Mythology>(at('mythologies', id), input),
    deleteMythology: (id: string) => remove(at('mythologies', id)),
    addToMythology: (mythologyId: string, traditionId: string) =>
      post<unknown>(at('mythologies', mythologyId, 'traditions'), { traditionId }),
    removeFromMythology: (mythologyId: string, traditionId: string) =>
      remove(at('mythologies', mythologyId, 'traditions', traditionId)),
  };
}

export type NarrativeApi = ReturnType<typeof createNarrativeApi>;

/** The shared messages for these two statuses talk about traces, so they are replaced. */
export function narrativeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'This could not be found. It may have been deleted.';
  if (error instanceof ApiError && error.status === 409) return error.message;
  return errorMessage(error);
}

export function beatInUse(error: unknown): BeatInUse | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.rawDetails as Partial<BeatInUse> | undefined;
  return Array.isArray(details?.versions)
    ? { versions: details.versions, versionBeatIds: details.versionBeatIds ?? [] }
    : null;
}
