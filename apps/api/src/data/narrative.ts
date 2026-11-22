import { randomUUID } from "node:crypto";
import {
  FieldPath,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type FirestoreDataConverter,
  type Query,
  type Transaction,
} from "@google-cloud/firestore";
import { collections, converters } from "@disnostos/model/firestore";
import {
  BeatCreateSchema,
  MythCreateSchema,
  MythologyCreateSchema,
  TraditionCreateSchema,
  VersionCreateSchema,
  WordingCreateSchema,
  type Beat,
  type Myth,
  type Mythology,
  type MythologyTradition,
  type Tradition,
  type TraditionVersion,
  type Version,
  type VersionBeat,
  type VersionRevision,
  type Wording,
  type WordingRevision,
} from "@disnostos/model/schemas";
import type { EntityName } from "@disnostos/model/spec";
import { z } from "zod";
import { parse, parseLimit, stableId } from "./common";
import { chunks, DeletePlan } from "./deletePlan";
import { conflict, DataError, invalid, notFound } from "./errors";

const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_NOTE_LENGTH = 2000;
/** Keeps a wording well inside Firestore's 1 MiB document limit. */
const MAX_TEXT_BYTES = 512 * 1024;
/** A version's revision holds its whole order, so it must also fit in one document. */
const MAX_SNAPSHOT_BYTES = 900 * 1024;
const POSITION_GAP = 1024;
/** Below this, midpoints lose precision, so the version's positions are respaced. */
const MIN_POSITION_GAP = 1e-6;

const uuid = z.uuid();
const Name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const Description = z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH).nullish();
const Note = z.string().trim().min(1).max(MAX_NOTE_LENGTH).nullish();
const Text = z.string().refine((value) => value.trim().length > 0, "Must not be blank");
const nonEmpty = (value: object) => Object.keys(value).length > 0;
const atLeastOne = "Provide at least one field";

const MythInput = MythCreateSchema.pick({ title: true, summary: true }).extend({
  title: Name,
  summary: Description,
});
const VersionInput = VersionCreateSchema.pick({ title: true, description: true }).extend({
  title: Name,
  description: Description,
});
const WordingInput = WordingCreateSchema.pick({
  language: true,
  text: true,
  translatedFromId: true,
}).extend({ text: Text });
const InlineWording = WordingInput.omit({ translatedFromId: true });
const TraditionInput = TraditionCreateSchema.pick({ name: true, description: true }).extend({
  name: Name,
  description: Description,
});
const MythologyInput = MythologyCreateSchema.pick({ name: true, description: true }).extend({
  name: Name,
  description: Description,
});

const MythCreate = MythInput.extend({ version: VersionInput.optional() });
const VersionCreate = VersionInput.extend({ traditionId: uuid.optional() });
const TraditionCreate = TraditionInput.extend({
  mythologyId: uuid.optional(),
  versionId: uuid.optional(),
});
const BeatCreate = BeatCreateSchema.pick({ label: true })
  .extend({
    label: Name,
    wording: InlineWording.optional(),
    versionId: uuid.optional(),
    afterVersionBeatId: uuid.nullable().optional(),
    note: Note,
  })
  .refine(
    (value) =>
      value.versionId !== undefined ||
      (value.afterVersionBeatId === undefined && (value.note === undefined || value.note === null)),
    { path: ["versionId"], error: "afterVersionBeatId and note require versionId" },
  );

const Placement = {
  position: z.number().finite().optional(),
  afterId: uuid.nullable().optional(),
};
const onePlacement = (value: { position?: number; afterId?: string | null }) =>
  value.position === undefined || value.afterId === undefined;
const placementError = { path: ["position"], error: "Provide position or afterId, not both" };

const VersionBeatAdd = z
  .strictObject({ beatId: uuid, wordingId: uuid.nullish(), note: Note, ...Placement })
  .refine(onePlacement, placementError);
const VersionBeatPatch = z
  .strictObject({ wordingId: uuid.nullable().optional(), note: Note, ...Placement })
  .refine(nonEmpty, atLeastOne)
  .refine(onePlacement, placementError);
const VersionRef = z.strictObject({ versionId: uuid });
const TraditionRef = z.strictObject({ traditionId: uuid });

const patchOf = <T extends z.ZodObject>(schema: T) =>
  schema.partial().refine(nonEmpty, atLeastOne);
const MythPatch = patchOf(MythInput);
const BeatPatch = z.strictObject({ label: Name });
const WordingPatch = patchOf(WordingInput);
const VersionPatch = patchOf(VersionInput);
const TraditionPatch = patchOf(TraditionInput);
const MythologyPatch = patchOf(MythologyInput);

/** What the API returns for a stored row: everything but its owner and visibility. */
export type View<T> = Omit<T, "ownerId" | "visibility">;
export type Page<T> = { items: View<T>[]; nextCursor: string | null };
export type PageOptions = { cursor?: string | null; limit?: string | null };

export type BeatDetail = View<Beat> & { wordings: View<Wording>[] };
export type VersionDetail = View<Version> & { beats: View<VersionBeat>[]; traditionIds: string[] };
export type TraditionDetail = View<Tradition> & { versionIds: string[]; mythologyIds: string[] };
export type MythologyDetail = View<Mythology> & { traditionIds: string[] };
export type MythFull = {
  myth: View<Myth>;
  beats: BeatDetail[];
  versions: (VersionDetail & { mythologyIds: string[] })[];
  traditions: (View<Tradition> & { mythologyIds: string[] })[];
  mythologies: View<Mythology>[];
};

export type NarrativeLayer = ReturnType<typeof createNarrativeLayer>;

function view<T extends { ownerId: string }>(row: T): View<T> {
  const { ownerId: _owner, visibility: _visibility, ...rest } = row as T & { visibility?: unknown };
  return rest as unknown as View<T>;
}

const byCreated = <T extends { createdAt: Date; id: string }>(a: T, b: T) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
const byPosition = (a: VersionBeat, b: VersionBeat) => a.position - b.position;

const assertId = (id: string) => {
  if (!uuid.safeParse(id).success) throw notFound();
};

function assertTextSize(text: string | undefined) {
  if (text !== undefined && Buffer.byteLength(text) > MAX_TEXT_BYTES) {
    throw new DataError(413, "Wording text is too large");
  }
}

const encodeCursor = (row: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify([row.createdAt.getTime(), row.id])).toString("base64url");

function decodeCursor(cursor: string): [Timestamp, string] {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (Number.isSafeInteger(createdAt) && uuid.safeParse(id).success) {
      return [Timestamp.fromMillis(createdAt), id];
    }
  } catch {
    // Reported below.
  }
  throw invalid("Invalid cursor");
}

type Placed = { position: number; shifted: VersionBeat[] };

/**
 * Finds a position among `others`, which must be sorted. With no target the beat goes last, and
 * `afterId: null` puts it first. Respaces the whole version when a midpoint has no room left.
 */
export function placeBeat(
  others: readonly VersionBeat[],
  target: { position?: number; afterId?: string | null },
): Placed {
  if (target.position !== undefined) {
    if (others.some((row) => row.position === target.position)) {
      throw conflict("Another beat already has this position");
    }
    return { position: target.position, shifted: [] };
  }

  let index = others.length;
  if (target.afterId === null) {
    index = 0;
  } else if (target.afterId !== undefined) {
    const at = others.findIndex((row) => row.id === target.afterId);
    if (at < 0) throw invalid("afterId is not a beat of this version");
    index = at + 1;
  }

  const previous = others[index - 1]?.position;
  const next = others[index]?.position;
  const candidate =
    previous === undefined
      ? next === undefined
        ? POSITION_GAP
        : next - POSITION_GAP
      : next === undefined
        ? previous + POSITION_GAP
        : previous / 2 + next / 2;
  const hasRoom =
    (previous === undefined || candidate - previous >= MIN_POSITION_GAP) &&
    (next === undefined || next - candidate >= MIN_POSITION_GAP);
  if (hasRoom) return { position: candidate, shifted: [] };

  const shifted = others.flatMap((row, rowIndex) => {
    const position = POSITION_GAP * (rowIndex < index ? rowIndex + 1 : rowIndex + 2);
    return position === row.position ? [] : [{ ...row, position }];
  });
  return { position: POSITION_GAP * (index + 1), shifted };
}

type VersionState = { version: Version; rows: VersionBeat[]; nextRevision: number };

/**
 * All narrative data access. Every method takes the caller's ID and checks ownership here, so no
 * route can forget to. Another user's object is reported as absent, even when only referenced.
 */
export function createNarrativeLayer(db: Firestore) {
  // The generated converters accept any input, so each collection states its row type here.
  const collection = <T extends DocumentData>(name: EntityName) =>
    db
      .collection(collections[name])
      .withConverter(converters[name] as unknown as FirestoreDataConverter<T>);
  const myths = collection<Myth>("Myth");
  const beats = collection<Beat>("Beat");
  const wordings = collection<Wording>("Wording");
  const wordingRevisions = collection<WordingRevision>("WordingRevision");
  const versions = collection<Version>("Version");
  const versionBeats = collection<VersionBeat>("VersionBeat");
  const versionRevisions = collection<VersionRevision>("VersionRevision");
  const traditions = collection<Tradition>("Tradition");
  const traditionVersions = collection<TraditionVersion>("TraditionVersion");
  const mythologies = collection<Mythology>("Mythology");
  const mythologyTraditions = collection<MythologyTradition>("MythologyTradition");

  async function owned<T extends { ownerId: string }>(
    tx: Transaction,
    ref: DocumentReference<T, any>,
    ownerId: string,
  ): Promise<T> {
    const row = (await tx.get(ref)).data();
    if (!row || row.ownerId !== ownerId) throw notFound();
    return row;
  }

  /** Runs one equality-on-owner `in` query per chunk of IDs. */
  async function whereIn<T>(
    tx: Transaction,
    source: CollectionReference<T, any>,
    ownerId: string,
    field: string,
    ids: readonly string[],
  ): Promise<T[]> {
    const pages = await Promise.all(
      chunks([...new Set(ids)]).map((chunk) =>
        tx.get(source.where("ownerId", "==", ownerId).where(field, "in", chunk)),
      ),
    );
    return pages.flatMap((page) => page.docs.map((doc) => doc.data()));
  }

  async function getMany<T extends { ownerId: string }>(
    tx: Transaction,
    source: CollectionReference<T, any>,
    ownerId: string,
    ids: readonly string[],
  ): Promise<T[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const docs = await tx.getAll(...unique.map((id) => source.doc(id)));
    return docs.flatMap((doc) => {
      const row = doc.data();
      return row && row.ownerId === ownerId ? [row] : [];
    });
  }

  /**
   * The next number in an append-only log. Callers also write the parent in the same
   * transaction, which serialises them, and the revision's ID is derived from this number.
   */
  async function nextRevisionNumber(
    tx: Transaction,
    log: Query<any, any>,
    ownerId: string,
    field: string,
    id: string,
  ): Promise<number> {
    const counted = await tx.get(log.where("ownerId", "==", ownerId).where(field, "==", id).count());
    return counted.data().count + 1;
  }

  function writeWordingRevision(tx: Transaction, wording: Wording, number: number, now: Date) {
    const id = stableId("wording-revision", wording.id, String(number));
    const revision: WordingRevision = {
      id,
      ownerId: wording.ownerId,
      wordingId: wording.id,
      number,
      snapshot: {
        language: wording.language,
        text: wording.text,
        translatedFromId: wording.translatedFromId,
      },
      createdAt: now,
      updatedAt: now,
    };
    // The recursive JSON type is too deep for Firestore's write types.
    tx.create(wordingRevisions.doc(id), revision as never);
  }

  function writeVersionRevision(
    tx: Transaction,
    version: Version,
    rows: readonly VersionBeat[],
    number: number,
    now: Date,
  ) {
    const snapshot = {
      title: version.title,
      description: version.description,
      beats: [...rows].sort(byPosition).map((row) => ({
        versionBeatId: row.id,
        beatId: row.beatId,
        wordingId: row.wordingId,
        position: row.position,
        note: row.note,
      })),
    };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES) {
      throw new DataError(413, "Version is too large");
    }
    const id = stableId("version-revision", version.id, String(number));
    const revision: VersionRevision = {
      id,
      ownerId: version.ownerId,
      versionId: version.id,
      number,
      snapshot,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(versionRevisions.doc(id), revision as never);
  }

  async function loadVersion(
    tx: Transaction,
    ownerId: string,
    versionId: string,
  ): Promise<VersionState> {
    const [version, found, nextRevision] = await Promise.all([
      owned(tx, versions.doc(versionId), ownerId),
      tx.get(versionBeats.where("ownerId", "==", ownerId).where("versionId", "==", versionId)),
      nextRevisionNumber(tx, versionRevisions, ownerId, "versionId", versionId),
    ]);
    return { version, rows: found.docs.map((doc) => doc.data()).sort(byPosition), nextRevision };
  }

  /** Touches the version, which serialises concurrent edits, and logs its new content. */
  function commitVersion(
    tx: Transaction,
    state: VersionState,
    rows: readonly VersionBeat[],
    now: Date,
    changes: Partial<Version> = {},
  ): Version {
    const version: Version = { ...state.version, ...changes, updatedAt: now };
    tx.set(versions.doc(version.id), version);
    writeVersionRevision(tx, version, rows, state.nextRevision, now);
    return version;
  }

  async function chosenWording(
    tx: Transaction,
    ownerId: string,
    wordingId: string | null | undefined,
    beatId: string,
  ): Promise<void> {
    if (wordingId === null || wordingId === undefined) return;
    const wording = await owned(tx, wordings.doc(wordingId), ownerId);
    if (wording.beatId !== beatId) throw invalid("The wording must belong to the beat");
  }

  function newWording(
    ownerId: string,
    beatId: string,
    input: { language: string; text: string; translatedFromId?: string | null },
    now: Date,
  ): Wording {
    return {
      id: randomUUID(),
      ownerId,
      visibility: "private",
      forkedFromId: null,
      beatId,
      language: input.language,
      text: input.text,
      translatedFromId: input.translatedFromId ?? null,
      promotedFromTraceId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function newVersion(
    ownerId: string,
    mythId: string,
    input: { title: string; description?: string | null },
    now: Date,
  ): Version {
    return {
      id: randomUUID(),
      ownerId,
      visibility: "private",
      forkedFromId: null,
      mythId,
      title: input.title,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function newTraditionVersion(
    ownerId: string,
    traditionId: string,
    versionId: string,
    now: Date,
  ): TraditionVersion {
    return {
      id: stableId(ownerId, traditionId, versionId),
      ownerId,
      traditionId,
      versionId,
      createdAt: now,
      updatedAt: now,
    };
  }

  function newMythologyTradition(
    ownerId: string,
    mythologyId: string,
    traditionId: string,
    now: Date,
  ): MythologyTradition {
    return {
      id: stableId(ownerId, mythologyId, traditionId),
      ownerId,
      mythologyId,
      traditionId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function listPage<T extends { ownerId: string; id: string; createdAt: Date }>(
    source: CollectionReference<T, any>,
    ownerId: string,
    options: PageOptions,
  ): Promise<Page<T>> {
    const limit = parseLimit(options.limit);
    let query = source
      .where("ownerId", "==", ownerId)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (options.cursor) query = query.startAfter(...decodeCursor(options.cursor));
    const found = await query.limit(limit + 1).get();
    const rows = found.docs.slice(0, limit).map((doc) => doc.data());
    return {
      items: rows.map(view),
      nextCursor: found.docs.length > limit ? encodeCursor(rows[rows.length - 1]!) : null,
    };
  }

  async function assertOwned<T extends { ownerId: string }>(
    ref: DocumentReference<T, any>,
    ownerId: string,
  ): Promise<T> {
    const row = (await ref.get()).data();
    if (!row || row.ownerId !== ownerId) throw notFound();
    return row;
  }

  async function childrenOf<T extends { createdAt: Date; id: string }>(
    source: CollectionReference<T, any>,
    ownerId: string,
    field: string,
    id: string,
  ): Promise<T[]> {
    const found = await source.where("ownerId", "==", ownerId).where(field, "==", id).get();
    return found.docs.map((doc) => doc.data()).sort(byCreated);
  }

  async function patchRow<T extends { ownerId: string; updatedAt: Date }>(
    ref: DocumentReference<T, any>,
    ownerId: string,
    patch: Partial<T>,
  ): Promise<View<T>> {
    return db.runTransaction(async (tx) => {
      const row = await owned(tx, ref, ownerId);
      const updated = { ...row, ...patch, updatedAt: new Date() } as T;
      tx.set(ref, updated as never);
      return view(updated);
    });
  }

  async function deleteRow<T extends { ownerId: string }>(
    entity: EntityName,
    ref: DocumentReference<T, any>,
    ownerId: string,
  ): Promise<void> {
    await db.runTransaction(async (tx) => {
      await owned(tx, ref, ownerId);
      const plan = new DeletePlan(db, tx);
      await plan.remove(entity, db.collection(collections[entity]).doc(ref.id));
      plan.apply(new Date());
    });
  }

  const layer = {
    // Myths

    listMyths: (ownerId: string, options: PageOptions = {}) => listPage(myths, ownerId, options),

    async createMyth(ownerId: string, input: unknown) {
      const data = parse(MythCreate, input);
      const now = new Date();
      const myth: Myth = {
        id: randomUUID(),
        ownerId,
        visibility: "private",
        forkedFromId: null,
        title: data.title,
        summary: data.summary ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const version = data.version ? newVersion(ownerId, myth.id, data.version, now) : null;
      await db.runTransaction(async (tx) => {
        tx.create(myths.doc(myth.id), myth);
        if (version) {
          tx.create(versions.doc(version.id), version);
          writeVersionRevision(tx, version, [], 1, now);
        }
      });
      return { myth: view(myth), version: version ? view(version) : null };
    },

    async getMyth(ownerId: string, mythId: string) {
      assertId(mythId);
      return view(await assertOwned(myths.doc(mythId), ownerId));
    },

    async updateMyth(ownerId: string, mythId: string, input: unknown) {
      assertId(mythId);
      return patchRow(myths.doc(mythId), ownerId, parse(MythPatch, input) as Partial<Myth>);
    },

    async deleteMyth(ownerId: string, mythId: string) {
      assertId(mythId);
      await deleteRow("Myth", myths.doc(mythId), ownerId);
    },

    /** The whole myth from one consistent snapshot, with reads batched per level. */
    async getMythFull(ownerId: string, mythId: string): Promise<MythFull> {
      assertId(mythId);
      return db.runTransaction(
        async (tx) => {
          const [myth, beatDocs, versionDocs] = await Promise.all([
            owned(tx, myths.doc(mythId), ownerId),
            tx.get(beats.where("ownerId", "==", ownerId).where("mythId", "==", mythId)),
            tx.get(versions.where("ownerId", "==", ownerId).where("mythId", "==", mythId)),
          ]);
          const beatRows = beatDocs.docs.map((doc) => doc.data()).sort(byCreated);
          const versionRows = versionDocs.docs.map((doc) => doc.data()).sort(byCreated);
          const versionIds = versionRows.map((row) => row.id);

          const [wordingRows, placements, memberships] = await Promise.all([
            whereIn(tx, wordings, ownerId, "beatId", beatRows.map((row) => row.id)),
            whereIn(tx, versionBeats, ownerId, "versionId", versionIds),
            whereIn(tx, traditionVersions, ownerId, "versionId", versionIds),
          ]);
          const traditionIds = [...new Set(memberships.map((row) => row.traditionId))];
          const [traditionRows, parents] = await Promise.all([
            getMany(tx, traditions, ownerId, traditionIds),
            whereIn(tx, mythologyTraditions, ownerId, "traditionId", traditionIds),
          ]);
          const mythologyRows = await getMany(
            tx,
            mythologies,
            ownerId,
            parents.map((row) => row.mythologyId),
          );

          const mythologyIdsOf = (traditionId: string) =>
            parents.filter((row) => row.traditionId === traditionId).map((row) => row.mythologyId);

          return {
            myth: view(myth),
            beats: beatRows.map((beat) => ({
              ...view(beat),
              wordings: wordingRows
                .filter((row) => row.beatId === beat.id)
                .sort(byCreated)
                .map(view),
            })),
            versions: versionRows.map((version) => {
              const ids = memberships
                .filter((row) => row.versionId === version.id)
                .map((row) => row.traditionId);
              return {
                ...view(version),
                beats: placements
                  .filter((row) => row.versionId === version.id)
                  .sort(byPosition)
                  .map(view),
                traditionIds: ids,
                mythologyIds: [...new Set(ids.flatMap(mythologyIdsOf))],
              };
            }),
            traditions: traditionRows
              .sort(byCreated)
              .map((row) => ({ ...view(row), mythologyIds: mythologyIdsOf(row.id) })),
            mythologies: mythologyRows.sort(byCreated).map(view),
          };
        },
        { readOnly: true },
      );
    },

    // Beats

    async listBeats(ownerId: string, mythId: string) {
      assertId(mythId);
      await assertOwned(myths.doc(mythId), ownerId);
      const rows = await childrenOf(beats, ownerId, "mythId", mythId);
      return { items: rows.map(view), nextCursor: null };
    },

    /** Creates the beat and, optionally, its wording and its place in a version, atomically. */
    async createBeat(ownerId: string, mythId: string, input: unknown) {
      assertId(mythId);
      const data = parse(BeatCreate, input);
      assertTextSize(data.wording?.text);
      const now = new Date();
      const beat: Beat = {
        id: randomUUID(),
        ownerId,
        visibility: "private",
        forkedFromId: null,
        mythId,
        label: data.label,
        createdAt: now,
        updatedAt: now,
      };
      const wording = data.wording ? newWording(ownerId, beat.id, data.wording, now) : null;

      return db.runTransaction(async (tx) => {
        const [, state] = await Promise.all([
          owned(tx, myths.doc(mythId), ownerId),
          data.versionId ? loadVersion(tx, ownerId, data.versionId) : null,
        ]);
        if (state && state.version.mythId !== mythId) {
          throw invalid("The version must belong to this myth");
        }

        let versionBeat: VersionBeat | null = null;
        tx.create(beats.doc(beat.id), beat);
        if (wording) {
          tx.create(wordings.doc(wording.id), wording);
          writeWordingRevision(tx, wording, 1, now);
        }
        if (state) {
          const { position, shifted } = placeBeat(state.rows, { afterId: data.afterVersionBeatId });
          versionBeat = {
            id: randomUUID(),
            ownerId,
            versionId: state.version.id,
            beatId: beat.id,
            wordingId: wording?.id ?? null,
            position,
            note: data.note ?? null,
            createdAt: now,
            updatedAt: now,
          };
          tx.create(versionBeats.doc(versionBeat.id), versionBeat);
          for (const row of shifted) {
            tx.set(versionBeats.doc(row.id), { ...row, updatedAt: now });
          }
          const moved = new Map(shifted.map((row) => [row.id, row]));
          const rows = [...state.rows.map((row) => moved.get(row.id) ?? row), versionBeat];
          commitVersion(tx, state, rows, now);
        }
        return {
          beat: view(beat),
          wording: wording ? view(wording) : null,
          versionBeat: versionBeat ? view(versionBeat) : null,
        };
      });
    },

    async getBeat(ownerId: string, beatId: string): Promise<BeatDetail> {
      assertId(beatId);
      const beat = await assertOwned(beats.doc(beatId), ownerId);
      const rows = await childrenOf(wordings, ownerId, "beatId", beatId);
      return { ...view(beat), wordings: rows.map(view) };
    },

    async updateBeat(ownerId: string, beatId: string, input: unknown) {
      assertId(beatId);
      return patchRow(beats.doc(beatId), ownerId, parse(BeatPatch, input));
    },

    /** Refuses while a version uses the beat, naming those versions. */
    async deleteBeat(ownerId: string, beatId: string) {
      assertId(beatId);
      await db.runTransaction(async (tx) => {
        await owned(tx, beats.doc(beatId), ownerId);
        const uses = await tx.get(
          versionBeats.where("ownerId", "==", ownerId).where("beatId", "==", beatId),
        );
        if (!uses.empty) {
          const rows = uses.docs.map((doc) => doc.data());
          const using = await getMany(tx, versions, ownerId, rows.map((row) => row.versionId));
          throw conflict("This beat is used by a version", {
            versions: using.map(({ id, title }) => ({ id, title })),
            versionBeatIds: rows.map((row) => row.id),
          });
        }
        const plan = new DeletePlan(db, tx);
        await plan.remove("Beat", db.collection(collections.Beat).doc(beatId));
        plan.apply(new Date());
      });
    },

    // Wordings

    async listWordings(ownerId: string, beatId: string) {
      assertId(beatId);
      await assertOwned(beats.doc(beatId), ownerId);
      const rows = await childrenOf(wordings, ownerId, "beatId", beatId);
      return { items: rows.map(view), nextCursor: null };
    },

    async createWording(ownerId: string, beatId: string, input: unknown) {
      assertId(beatId);
      const data = parse(WordingInput, input);
      assertTextSize(data.text);
      const now = new Date();
      const wording = newWording(ownerId, beatId, data, now);
      await db.runTransaction(async (tx) => {
        await owned(tx, beats.doc(beatId), ownerId);
        if (data.translatedFromId) {
          const source = await owned(tx, wordings.doc(data.translatedFromId), ownerId);
          if (source.beatId !== beatId) {
            throw invalid("translatedFromId must point to a wording of the same beat");
          }
        }
        tx.create(wordings.doc(wording.id), wording);
        writeWordingRevision(tx, wording, 1, now);
      });
      return view(wording);
    },

    async getWording(ownerId: string, wordingId: string) {
      assertId(wordingId);
      return view(await assertOwned(wordings.doc(wordingId), ownerId));
    },

    async updateWording(ownerId: string, wordingId: string, input: unknown) {
      assertId(wordingId);
      const patch = parse(WordingPatch, input);
      assertTextSize(patch.text);
      return db.runTransaction(async (tx) => {
        const wording = await owned(tx, wordings.doc(wordingId), ownerId);
        const translatedFromId =
          patch.translatedFromId === undefined ? wording.translatedFromId : patch.translatedFromId;

        if (translatedFromId && translatedFromId !== wording.translatedFromId) {
          const siblings = await tx.get(
            wordings.where("ownerId", "==", ownerId).where("beatId", "==", wording.beatId),
          );
          const parentOf = new Map(
            siblings.docs.map((doc) => [doc.id, doc.data().translatedFromId]),
          );
          if (!parentOf.has(translatedFromId)) {
            throw invalid("translatedFromId must point to a wording of the same beat");
          }
          const seen = new Set<string>();
          for (let at: string | null | undefined = translatedFromId; at; at = parentOf.get(at)) {
            if (at === wordingId || seen.has(at)) {
              throw invalid("A wording cannot be a translation of itself");
            }
            seen.add(at);
          }
        }

        const updated: Wording = {
          ...wording,
          language: patch.language ?? wording.language,
          text: patch.text ?? wording.text,
          translatedFromId,
        };
        if (
          updated.language === wording.language &&
          updated.text === wording.text &&
          updated.translatedFromId === wording.translatedFromId
        ) {
          return view(wording);
        }
        const now = new Date();
        const number = await nextRevisionNumber(tx, wordingRevisions, ownerId, "wordingId", wordingId);
        updated.updatedAt = now;
        tx.set(wordings.doc(wordingId), updated);
        writeWordingRevision(tx, updated, number, now);
        return view(updated);
      });
    },

    /**
     * Versions that chose this wording fall back to no chosen wording, and translations of it
     * lose their source. Both are content changes, so each gets a new revision.
     */
    async deleteWording(ownerId: string, wordingId: string) {
      assertId(wordingId);
      await db.runTransaction(async (tx) => {
        await owned(tx, wordings.doc(wordingId), ownerId);
        const [chosenBy, translations] = await Promise.all([
          tx.get(versionBeats.where("ownerId", "==", ownerId).where("wordingId", "==", wordingId)),
          tx.get(wordings.where("ownerId", "==", ownerId).where("translatedFromId", "==", wordingId)),
        ]);
        const versionIds = [...new Set(chosenBy.docs.map((doc) => doc.data().versionId))];
        const [states, translationNumbers] = await Promise.all([
          Promise.all(versionIds.map((id) => loadVersion(tx, ownerId, id))),
          Promise.all(
            translations.docs.map((doc) =>
              nextRevisionNumber(tx, wordingRevisions, ownerId, "wordingId", doc.id),
            ),
          ),
        ]);
        const plan = new DeletePlan(db, tx);
        await plan.remove("Wording", db.collection(collections.Wording).doc(wordingId));

        const now = new Date();
        plan.apply(now);
        for (const state of states) {
          const rows = state.rows.map((row) =>
            row.wordingId === wordingId ? { ...row, wordingId: null } : row,
          );
          commitVersion(tx, state, rows, now);
        }
        translations.docs.forEach((doc, index) => {
          writeWordingRevision(
            tx,
            { ...doc.data(), translatedFromId: null },
            translationNumbers[index]!,
            now,
          );
        });
      });
    },

    // Versions

    async listVersions(
      ownerId: string,
      options: PageOptions & { mythId?: string | null } = {},
    ): Promise<Page<Version>> {
      if (!options.mythId) return listPage(versions, ownerId, options);
      if (options.cursor || options.limit) {
        throw invalid("cursor and limit do not apply when filtering by mythId");
      }
      return layer.listVersionsOfMyth(ownerId, options.mythId);
    },

    async listVersionsOfMyth(ownerId: string, mythId: string): Promise<Page<Version>> {
      assertId(mythId);
      await assertOwned(myths.doc(mythId), ownerId);
      const rows = await childrenOf(versions, ownerId, "mythId", mythId);
      return { items: rows.map(view), nextCursor: null };
    },

    async createVersion(ownerId: string, mythId: string, input: unknown) {
      assertId(mythId);
      const data = parse(VersionCreate, input);
      const now = new Date();
      const version = newVersion(ownerId, mythId, data, now);
      const membership = data.traditionId
        ? newTraditionVersion(ownerId, data.traditionId, version.id, now)
        : null;
      await db.runTransaction(async (tx) => {
        await Promise.all([
          owned(tx, myths.doc(mythId), ownerId),
          data.traditionId ? owned(tx, traditions.doc(data.traditionId), ownerId) : null,
        ]);
        tx.create(versions.doc(version.id), version);
        writeVersionRevision(tx, version, [], 1, now);
        if (membership) tx.create(traditionVersions.doc(membership.id), membership);
      });
      return {
        version: view(version),
        traditionVersion: membership ? view(membership) : null,
      };
    },

    async getVersion(ownerId: string, versionId: string): Promise<VersionDetail> {
      assertId(versionId);
      const version = await assertOwned(versions.doc(versionId), ownerId);
      const [rows, memberships] = await Promise.all([
        childrenOf(versionBeats, ownerId, "versionId", versionId),
        childrenOf(traditionVersions, ownerId, "versionId", versionId),
      ]);
      return {
        ...view(version),
        beats: rows.sort(byPosition).map(view),
        traditionIds: memberships.map((row) => row.traditionId),
      };
    },

    async updateVersion(ownerId: string, versionId: string, input: unknown) {
      assertId(versionId);
      const patch = parse(VersionPatch, input);
      return db.runTransaction(async (tx) => {
        const state = await loadVersion(tx, ownerId, versionId);
        const title = patch.title ?? state.version.title;
        const description =
          patch.description === undefined ? state.version.description : patch.description;
        if (title === state.version.title && description === state.version.description) {
          return view(state.version);
        }
        return view(commitVersion(tx, state, state.rows, new Date(), { title, description }));
      });
    },

    async deleteVersion(ownerId: string, versionId: string) {
      assertId(versionId);
      await deleteRow("Version", versions.doc(versionId), ownerId);
    },

    // Version composition

    async listVersionBeats(ownerId: string, versionId: string) {
      assertId(versionId);
      await assertOwned(versions.doc(versionId), ownerId);
      const rows = await childrenOf(versionBeats, ownerId, "versionId", versionId);
      return { items: rows.sort(byPosition).map(view), nextCursor: null };
    },

    async addVersionBeat(ownerId: string, versionId: string, input: unknown) {
      assertId(versionId);
      const data = parse(VersionBeatAdd, input);
      return db.runTransaction(async (tx) => {
        const [state, beat] = await Promise.all([
          loadVersion(tx, ownerId, versionId),
          owned(tx, beats.doc(data.beatId), ownerId),
          chosenWording(tx, ownerId, data.wordingId, data.beatId),
        ]);
        if (beat.mythId !== state.version.mythId) {
          throw invalid("The beat must belong to the version's myth");
        }
        const { position, shifted } = placeBeat(state.rows, data);
        const now = new Date();
        const row: VersionBeat = {
          id: randomUUID(),
          ownerId,
          versionId,
          beatId: beat.id,
          wordingId: data.wordingId ?? null,
          position,
          note: data.note ?? null,
          createdAt: now,
          updatedAt: now,
        };
        tx.create(versionBeats.doc(row.id), row);
        for (const other of shifted) {
          tx.set(versionBeats.doc(other.id), { ...other, updatedAt: now });
        }
        const moved = new Map(shifted.map((other) => [other.id, other]));
        commitVersion(tx, state, [...state.rows.map((other) => moved.get(other.id) ?? other), row], now);
        return view(row);
      });
    },

    /** Changes the chosen wording or note, or moves the beat. */
    async updateVersionBeat(
      ownerId: string,
      versionId: string,
      versionBeatId: string,
      input: unknown,
    ) {
      assertId(versionId);
      assertId(versionBeatId);
      const patch = parse(VersionBeatPatch, input);
      return db.runTransaction(async (tx) => {
        const state = await loadVersion(tx, ownerId, versionId);
        const index = state.rows.findIndex((row) => row.id === versionBeatId);
        if (index < 0) throw notFound();
        const row = state.rows[index]!;
        await chosenWording(tx, ownerId, patch.wordingId, row.beatId);
        if (patch.afterId === versionBeatId) throw invalid("A beat cannot move after itself");

        const others = state.rows.filter((other) => other.id !== versionBeatId);
        const previousId = index === 0 ? null : state.rows[index - 1]!.id;
        const moves =
          (patch.position !== undefined && patch.position !== row.position) ||
          (patch.afterId !== undefined && patch.afterId !== previousId);
        const placed = moves
          ? placeBeat(others, { position: patch.position, afterId: patch.afterId })
          : { position: row.position, shifted: [] };

        const wordingId = patch.wordingId === undefined ? row.wordingId : patch.wordingId;
        const note = patch.note === undefined ? row.note : patch.note;
        if (!moves && wordingId === row.wordingId && note === row.note) return view(row);

        const now = new Date();
        const updated: VersionBeat = {
          ...row,
          wordingId,
          note,
          position: placed.position,
          updatedAt: now,
        };
        tx.set(versionBeats.doc(row.id), updated);
        for (const other of placed.shifted) {
          tx.set(versionBeats.doc(other.id), { ...other, updatedAt: now });
        }
        const moved = new Map(placed.shifted.map((other) => [other.id, other]));
        commitVersion(tx, state, [...others.map((other) => moved.get(other.id) ?? other), updated], now);
        return view(updated);
      });
    },

    async removeVersionBeat(ownerId: string, versionId: string, versionBeatId: string) {
      assertId(versionId);
      assertId(versionBeatId);
      await db.runTransaction(async (tx) => {
        const state = await loadVersion(tx, ownerId, versionId);
        if (!state.rows.some((row) => row.id === versionBeatId)) throw notFound();
        tx.delete(versionBeats.doc(versionBeatId));
        commitVersion(
          tx,
          state,
          state.rows.filter((row) => row.id !== versionBeatId),
          new Date(),
        );
      });
    },

    // Traditions

    listTraditions: (ownerId: string, options: PageOptions = {}) =>
      listPage(traditions, ownerId, options),

    async createTradition(ownerId: string, input: unknown) {
      const data = parse(TraditionCreate, input);
      const now = new Date();
      const tradition: Tradition = {
        id: randomUUID(),
        ownerId,
        visibility: "private",
        name: data.name,
        description: data.description ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const inMythology = data.mythologyId
        ? newMythologyTradition(ownerId, data.mythologyId, tradition.id, now)
        : null;
      const withVersion = data.versionId
        ? newTraditionVersion(ownerId, tradition.id, data.versionId, now)
        : null;
      await db.runTransaction(async (tx) => {
        await Promise.all([
          data.mythologyId ? owned(tx, mythologies.doc(data.mythologyId), ownerId) : null,
          data.versionId ? owned(tx, versions.doc(data.versionId), ownerId) : null,
        ]);
        tx.create(traditions.doc(tradition.id), tradition);
        if (inMythology) tx.create(mythologyTraditions.doc(inMythology.id), inMythology);
        if (withVersion) tx.create(traditionVersions.doc(withVersion.id), withVersion);
      });
      return {
        tradition: view(tradition),
        mythologyTradition: inMythology ? view(inMythology) : null,
        traditionVersion: withVersion ? view(withVersion) : null,
      };
    },

    async getTradition(ownerId: string, traditionId: string): Promise<TraditionDetail> {
      assertId(traditionId);
      const tradition = await assertOwned(traditions.doc(traditionId), ownerId);
      const [members, parents] = await Promise.all([
        childrenOf(traditionVersions, ownerId, "traditionId", traditionId),
        childrenOf(mythologyTraditions, ownerId, "traditionId", traditionId),
      ]);
      return {
        ...view(tradition),
        versionIds: members.map((row) => row.versionId),
        mythologyIds: parents.map((row) => row.mythologyId),
      };
    },

    async updateTradition(ownerId: string, traditionId: string, input: unknown) {
      assertId(traditionId);
      return patchRow(
        traditions.doc(traditionId),
        ownerId,
        parse(TraditionPatch, input) as Partial<Tradition>,
      );
    },

    async deleteTradition(ownerId: string, traditionId: string) {
      assertId(traditionId);
      await deleteRow("Tradition", traditions.doc(traditionId), ownerId);
    },

    async addVersionToTradition(ownerId: string, traditionId: string, input: unknown) {
      assertId(traditionId);
      const { versionId } = parse(VersionRef, input);
      const row = newTraditionVersion(ownerId, traditionId, versionId, new Date());
      await db.runTransaction(async (tx) => {
        const [, , existing] = await Promise.all([
          owned(tx, traditions.doc(traditionId), ownerId),
          owned(tx, versions.doc(versionId), ownerId),
          tx.get(traditionVersions.doc(row.id)),
        ]);
        if (existing.exists) throw conflict("This version is already in the tradition");
        tx.create(traditionVersions.doc(row.id), row);
      });
      return view(row);
    },

    async removeVersionFromTradition(ownerId: string, traditionId: string, versionId: string) {
      assertId(traditionId);
      assertId(versionId);
      const ref = traditionVersions.doc(stableId(ownerId, traditionId, versionId));
      await db.runTransaction(async (tx) => {
        await owned(tx, ref, ownerId);
        tx.delete(ref);
      });
    },

    // Mythologies

    listMythologies: (ownerId: string, options: PageOptions = {}) =>
      listPage(mythologies, ownerId, options),

    async createMythology(ownerId: string, input: unknown) {
      const data = parse(MythologyInput, input);
      const now = new Date();
      const mythology: Mythology = {
        id: randomUUID(),
        ownerId,
        visibility: "private",
        name: data.name,
        description: data.description ?? null,
        createdAt: now,
        updatedAt: now,
      };
      await mythologies.doc(mythology.id).create(mythology);
      return view(mythology);
    },

    async getMythology(ownerId: string, mythologyId: string): Promise<MythologyDetail> {
      assertId(mythologyId);
      const mythology = await assertOwned(mythologies.doc(mythologyId), ownerId);
      const members = await childrenOf(mythologyTraditions, ownerId, "mythologyId", mythologyId);
      return { ...view(mythology), traditionIds: members.map((row) => row.traditionId) };
    },

    async updateMythology(ownerId: string, mythologyId: string, input: unknown) {
      assertId(mythologyId);
      return patchRow(
        mythologies.doc(mythologyId),
        ownerId,
        parse(MythologyPatch, input) as Partial<Mythology>,
      );
    },

    async deleteMythology(ownerId: string, mythologyId: string) {
      assertId(mythologyId);
      await deleteRow("Mythology", mythologies.doc(mythologyId), ownerId);
    },

    async addTraditionToMythology(ownerId: string, mythologyId: string, input: unknown) {
      assertId(mythologyId);
      const { traditionId } = parse(TraditionRef, input);
      const row = newMythologyTradition(ownerId, mythologyId, traditionId, new Date());
      await db.runTransaction(async (tx) => {
        const [, , existing] = await Promise.all([
          owned(tx, mythologies.doc(mythologyId), ownerId),
          owned(tx, traditions.doc(traditionId), ownerId),
          tx.get(mythologyTraditions.doc(row.id)),
        ]);
        if (existing.exists) throw conflict("This tradition is already in the mythology");
        tx.create(mythologyTraditions.doc(row.id), row);
      });
      return view(row);
    },

    async removeTraditionFromMythology(ownerId: string, mythologyId: string, traditionId: string) {
      assertId(mythologyId);
      assertId(traditionId);
      const ref = mythologyTraditions.doc(stableId(ownerId, mythologyId, traditionId));
      await db.runTransaction(async (tx) => {
        await owned(tx, ref, ownerId);
        tx.delete(ref);
      });
    },
  };
  return layer;
}
