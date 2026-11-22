import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAbort } from '../traces/api';
import { useToasts } from '../traces/toasts';
import {
  narrativeError,
  type FullVersion,
  type MythFull,
  type NarrativeApi,
  type PoolBeat,
  type VersionBeat,
  type Wording,
} from './api';
import { deriveLabel, paragraphs } from './model';

type Patch = (full: MythFull) => MythFull;
type Mutation<T> = {
  /** Applied to the screen at once and dropped, so rolled back, if the request fails. */
  optimistic?: Patch;
  run(): Promise<T>;
  /** Folds the server's answer into the confirmed state. */
  commit?(full: MythFull, result: T): MythFull;
  /** For changes with server-side effects, such as respaced positions. */
  refetch?: boolean;
  failure: string;
};

const stamp = () => new Date().toISOString();
const tempId = () => `temp-${crypto.randomUUID()}`;

const mapVersion = (full: MythFull, id: string, change: (version: FullVersion) => FullVersion): MythFull => ({
  ...full,
  versions: full.versions.map((version) => (version.id === id ? change(version) : version)),
});
const mapRow = (full: MythFull, versionId: string, id: string, change: (row: VersionBeat) => VersionBeat) =>
  mapVersion(full, versionId, (version) => ({
    ...version,
    beats: version.beats.map((row) => (row.id === id ? change(row) : row)),
  }));

/** Places a row after `afterId`; null is the start, undefined the end. */
export function placed(rows: VersionBeat[], row: VersionBeat, afterId: string | null | undefined) {
  const rest = rows.filter((other) => other.id !== row.id);
  if (afterId === undefined) return [...rest, row];
  if (afterId === null) return [row, ...rest];
  const index = rest.findIndex((other) => other.id === afterId);
  return index < 0 ? [...rest, row] : [...rest.slice(0, index + 1), row, ...rest.slice(index + 1)];
}

export function useMyth(api: NarrativeApi, mythId: string) {
  const { notify } = useToasts();
  const [confirmed, setConfirmed] = useState<MythFull | null>(null);
  const [pending, setPending] = useState<{ id: number; patch: Patch }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const nextId = useRef(1);
  // Temporary ids stay usable by requests queued before their row was saved.
  const saved = useRef(new Map<string, string>());
  const real = useCallback((id: string) => saved.current.get(id) ?? id, []);
  const realAfter = useCallback(
    (id: string | null | undefined) => (id === null || id === undefined ? id : real(id)),
    [real],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    api.full(mythId, controller.signal).then(setConfirmed, (error: unknown) => {
      if (!isAbort(error)) setLoadError(narrativeError(error));
    });
    return () => controller.abort();
  }, [api, attempt, mythId]);

  const data = useMemo(
    () => (confirmed ? pending.reduce((full, op) => op.patch(full), confirmed) : null),
    [confirmed, pending],
  );
  const latest = useRef(data);
  latest.current = data;

  // Requests run one at a time, so the server sees edits in the order they were made.
  const mutate = useCallback(
    <T,>({ optimistic, run, commit, refetch, failure }: Mutation<T>): Promise<T | null> => {
      const id = nextId.current++;
      if (optimistic) setPending((current) => [...current, { id, patch: optimistic }]);
      const settle = () => setPending((current) => current.filter((op) => op.id !== id));
      const task = queue.current.then(async () => {
        try {
          const result = await run();
          const fresh = refetch ? await api.full(mythId) : null;
          if (fresh) setConfirmed(fresh);
          else if (commit) setConfirmed((full) => (full ? commit(full, result) : full));
          settle();
          return result;
        } catch (error) {
          settle();
          notify(`${failure} ${narrativeError(error)}`);
          return null;
        }
      });
      queue.current = task;
      return task;
    },
    [api, mythId, notify],
  );

  /** Adds one passage per paragraph, and returns the paragraphs that could not be saved. */
  const addPassages = useCallback(
    async (input: { versionId: string; text: string; label?: string; language: string; afterId?: string | null }) => {
      const parts = paragraphs(input.text);
      let after = input.afterId;
      let failed = false;
      const tasks = parts.map((text) => {
        const ids = { row: tempId(), beat: tempId(), wording: tempId() };
        const label = (parts.length === 1 && input.label?.trim()) || deriveLabel(text);
        const anchor = after;
        const now = stamp();
        const times = { createdAt: now, updatedAt: now };
        const wording: Wording = {
          ...times,
          id: ids.wording,
          beatId: ids.beat,
          language: input.language,
          text,
          translatedFromId: null,
          promotedFromTraceId: null,
          forkedFromId: null,
        };
        const beat: PoolBeat = { ...times, id: ids.beat, mythId, label, forkedFromId: null, wordings: [wording] };
        const row: VersionBeat = {
          ...times,
          id: ids.row,
          versionId: input.versionId,
          beatId: ids.beat,
          wordingId: ids.wording,
          position: 0,
          note: null,
        };
        const place = (full: MythFull, newBeat: PoolBeat, newRow: VersionBeat) => ({
          ...mapVersion(full, input.versionId, (version) => ({
            ...version,
            beats: placed(version.beats, newRow, realAfter(anchor)),
          })),
          beats: [...full.beats, newBeat],
        });
        const task = mutate({
          optimistic: (full) => place(full, beat, row),
          run: async () => {
            // Later paragraphs are placed after earlier ones, so they stop at the first failure.
            if (failed) return null;
            const target = realAfter(anchor);
            const result = await api.createBeat(mythId, {
              label,
              wording: { language: input.language, text },
              versionId: input.versionId,
              ...(target === undefined ? {} : { afterVersionBeatId: target }),
            });
            saved.current.set(ids.row, result.versionBeat!.id);
            saved.current.set(ids.beat, result.beat.id);
            saved.current.set(ids.wording, result.wording!.id);
            return result;
          },
          commit: (full, result) =>
            result ? place(full, { ...result.beat, wordings: [result.wording!] }, result.versionBeat!) : full,
          failure: 'Could not save that passage.',
        });
        void task.then((result) => {
          if (!result) failed = true;
        });
        if (after !== undefined) after = ids.row;
        return task;
      });
      const results = await Promise.all(tasks);
      return parts.filter((_, index) => !results[index]);
    },
    [api, mutate, mythId, realAfter],
  );

  const moveRow = useCallback(
    (versionId: string, id: string, afterId: string | null) =>
      mutate({
        optimistic: (full) =>
          mapVersion(full, versionId, (version) => {
            const row = version.beats.find((other) => other.id === id);
            return row ? { ...version, beats: placed(version.beats, row, realAfter(afterId)) } : version;
          }),
        run: () => api.updateVersionBeat(versionId, real(id), { afterId: realAfter(afterId) ?? null }),
        refetch: true,
        failure: 'Could not move that passage.',
      }),
    [api, mutate, real, realAfter],
  );

  const addFromPool = useCallback(
    (versionId: string, beatId: string, wordingId: string | null, afterId?: string | null) => {
      const id = tempId();
      const now = stamp();
      const row: VersionBeat = {
        id,
        createdAt: now,
        updatedAt: now,
        versionId,
        beatId,
        wordingId,
        position: 0,
        note: null,
      };
      return mutate({
        optimistic: (full) =>
          mapVersion(full, versionId, (version) => ({
            ...version,
            beats: placed(version.beats, row, realAfter(afterId)),
          })),
        run: async () => {
          const target = realAfter(afterId);
          const result = await api.addVersionBeat(versionId, {
            beatId: real(beatId),
            wordingId: wordingId && real(wordingId),
            ...(target === undefined ? {} : { afterId: target }),
          });
          saved.current.set(id, result.id);
          return result;
        },
        refetch: true,
        failure: 'Could not add that beat.',
      });
    },
    [api, mutate, real, realAfter],
  );

  const removeRow = useCallback(
    (versionId: string, row: VersionBeat, label: string) => {
      const rows = latest.current?.versions.find((version) => version.id === versionId)?.beats ?? [];
      const index = rows.findIndex((other) => other.id === row.id);
      const afterId = index > 0 ? rows[index - 1]!.id : index === 0 ? null : undefined;
      const without = (full: MythFull, id: string) =>
        mapVersion(full, versionId, (version) => ({
          ...version,
          beats: version.beats.filter((other) => other.id !== id),
        }));
      void mutate({
        optimistic: (full) => without(full, row.id),
        run: async () => {
          await api.removeVersionBeat(versionId, real(row.id));
          return true;
        },
        commit: (full) => without(full, real(row.id)),
        failure: 'Could not remove that passage.',
      }).then((removed) => {
        if (!removed) return;
        notify(`Removed “${label}” from this variation`, {
          label: 'Undo',
          run: () => {
            void mutate({
              run: () => {
                const target = realAfter(afterId);
                return api.addVersionBeat(versionId, {
                  beatId: real(row.beatId),
                  wordingId: row.wordingId && real(row.wordingId),
                  note: row.note,
                  ...(target === undefined ? {} : { afterId: target }),
                });
              },
              refetch: true,
              failure: 'Could not put that passage back.',
            });
          },
        });
      });
    },
    [api, mutate, notify, real, realAfter],
  );

  const updateRow = useCallback(
    (versionId: string, id: string, input: { wordingId?: string | null; note?: string | null }) =>
      mutate({
        optimistic: (full) => mapRow(full, versionId, id, (row) => ({ ...row, ...input })),
        run: () => api.updateVersionBeat(versionId, real(id), input),
        commit: (full, result) => mapRow(full, versionId, result.id, () => result),
        failure: 'Could not save that change.',
      }),
    [api, mutate, real],
  );

  const renameBeat = useCallback(
    (id: string, label: string) => {
      const change = (full: MythFull, target: string) => ({
        ...full,
        beats: full.beats.map((beat) => (beat.id === target ? { ...beat, label } : beat)),
      });
      return mutate({
        optimistic: (full) => change(full, id),
        run: () => api.updateBeat(real(id), { label }),
        commit: (full, result) => change(full, result.id),
        failure: 'Could not rename that beat.',
      });
    },
    [api, mutate, real],
  );

  const saveWording = useCallback(
    (id: string, text: string) => {
      const change = (full: MythFull, target: string) => ({
        ...full,
        beats: full.beats.map((beat) => ({
          ...beat,
          wordings: beat.wordings.map((wording) => (wording.id === target ? { ...wording, text } : wording)),
        })),
      });
      return mutate({
        optimistic: (full) => change(full, id),
        run: () => api.updateWording(real(id), { text }),
        commit: (full, result) => change(full, result.id),
        failure: 'Could not save that wording.',
      });
    },
    [api, mutate, real],
  );

  /** Adds a wording and, when given a placement, makes it the one that telling uses. */
  const addWording = useCallback(
    async (beatId: string, language: string, text: string, use?: { versionId: string; rowId: string }) => {
      const wording = await mutate({
        run: () => api.createWording(real(beatId), { language, text }),
        commit: (full, result) => ({
          ...full,
          beats: full.beats.map((beat) =>
            beat.id === result.beatId ? { ...beat, wordings: [...beat.wordings, result] } : beat,
          ),
        }),
        failure: 'Could not add that wording.',
      });
      if (wording && use) await updateRow(use.versionId, use.rowId, { wordingId: wording.id });
      return wording;
    },
    [api, mutate, real, updateRow],
  );

  /** A change whose result is simplest to read back from the server. */
  const refresh = useCallback(
    <T,>(run: () => Promise<T>, failure: string, optimistic?: Patch) =>
      mutate({ run, refetch: true, failure, optimistic }),
    [mutate],
  );

  /** A plain field edit: shown at once and kept when the server accepts it. */
  const updateFull = useCallback(
    <T,>(optimistic: Patch, run: () => Promise<T>, failure: string) =>
      mutate({ optimistic, run, commit: (full) => optimistic(full), failure }),
    [mutate],
  );

  return {
    data,
    loadError,
    retry: () => setAttempt((value) => value + 1),
    real,
    addPassages,
    moveRow,
    addFromPool,
    removeRow,
    updateRow,
    renameBeat,
    saveWording,
    addWording,
    refresh,
    updateFull,
  };
}

export type MythStore = ReturnType<typeof useMyth>;
