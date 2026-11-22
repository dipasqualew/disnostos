import { createHash, randomUUID } from "node:crypto";
import { FieldPath, Timestamp, type Firestore } from "@google-cloud/firestore";
import { collections, converters } from "@disnostos/model/firestore";
import { TraceCreateSchema, type Trace } from "@disnostos/model/schemas";
import { z } from "zod";
import type { BlobStore } from "./blobs";
import { parse, parseLimit, stableId } from "./common";
import { DeletePlan } from "./deletePlan";
import { conflict, DataError, invalid, notFound } from "./errors";
import { detectImageType, MAX_IMAGE_BYTES } from "./images";
import { createNarrativeLayer } from "./narrative";

/** Keeps a trace well inside Firestore's 1 MiB document limit. */
const MAX_BODY_BYTES = 512 * 1024;
const MAX_NOTE_LENGTH = 2000;
const MAX_IMAGE_TITLE_LENGTH = 200;

const uuid = z.uuid();
const TraceInputSchema = TraceCreateSchema.omit({ visibility: true });
const TracePatchSchema = TraceInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field",
);
const LinkInputSchema = z.strictObject({
  traceId: z.uuid(),
  note: z.string().min(1).max(MAX_NOTE_LENGTH).nullish(),
});
const CalendarDate = TraceCreateSchema.shape.writtenOn;

export type TraceView = Omit<Trace, "ownerId" | "visibility">;
export type ImageView = {
  id: string;
  traceId: string;
  title: string;
  mimeType: string;
  byteSize: number;
  createdAt: Date;
};
export type LinkView = {
  id: string;
  note: string | null;
  createdAt: Date;
  trace: { id: string; title: string | null; writtenOn: string };
};
export type TraceDetail = TraceView & { images: ImageView[]; links: LinkView[] };
export type TracePage = { items: TraceView[]; nextCursor: string | null };
export type ListOptions = {
  from?: string | null;
  to?: string | null;
  cursor?: string | null;
  limit?: string | null;
};

export type DataLayer = ReturnType<typeof createDataLayer>;

const traceView = ({ ownerId: _owner, visibility: _visibility, ...view }: Trace): TraceView => view;

function assertSize(body: string | undefined) {
  if (body !== undefined && Buffer.byteLength(body) > MAX_BODY_BYTES) {
    throw new DataError(413, "Trace body is too large");
  }
}

const encodeCursor = (trace: Trace) =>
  Buffer.from(JSON.stringify([trace.writtenOn, trace.createdAt.getTime(), trace.id])).toString(
    "base64url",
  );

function decodeCursor(cursor: string): [string, Timestamp, string] {
  try {
    const [writtenOn, createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      CalendarDate.safeParse(writtenOn).success &&
      Number.isSafeInteger(createdAt) &&
      uuid.safeParse(id).success
    ) {
      return [writtenOn, Timestamp.fromMillis(createdAt), id];
    }
  } catch {
    // Reported below.
  }
  throw invalid("Invalid cursor");
}

/**
 * All trace data access. Every method takes the caller's ID and checks ownership
 * here, so no route can forget to. Another user's object is reported as absent.
 */
export function createDataLayer(db: Firestore, blobs: BlobStore) {
  const traces = db.collection(collections.Trace).withConverter(converters.Trace);
  const links = db.collection(collections.TraceLink).withConverter(converters.TraceLink);
  const attachments = db.collection(collections.Attachment).withConverter(converters.Attachment);
  const works = db.collection(collections.Work).withConverter(converters.Work);
  const assets = db.collection(collections.Asset).withConverter(converters.Asset);

  const ownedTrace = (snapshot: FirebaseFirestoreSnapshot<Trace>, ownerId: string): Trace => {
    const trace = snapshot.data();
    if (!trace || trace.ownerId !== ownerId) throw notFound();
    return trace;
  };

  const assertId = (id: string) => {
    if (!uuid.safeParse(id).success) throw notFound();
  };

  async function deleteObjects(keys: readonly string[]) {
    const results = await Promise.allSettled(keys.map((key) => blobs.delete(key)));
    for (const result of results) {
      // The metadata is gone, so the file is unreachable; it only needs cleaning up.
      if (result.status === "rejected") console.error("Failed to delete a stored image");
    }
  }

  async function imagesFor(ownerId: string, traceId: string): Promise<ImageView[]> {
    const found = await attachments
      .where("ownerId", "==", ownerId)
      .where("targetTraceId", "==", traceId)
      .get();
    const rows = found.docs.map((doc) => doc.data());
    if (rows.length === 0) return [];

    const workDocs = await db.getAll(...rows.map((row) => works.doc(row.workId)));
    const workById = new Map(workDocs.flatMap((doc) => (doc.exists ? [[doc.id, doc.data()!]] : [])));
    const assetIds = [...workById.values()].flatMap((work) => work.assetId ?? []);
    const assetDocs = assetIds.length ? await db.getAll(...assetIds.map((id) => assets.doc(id))) : [];
    const assetById = new Map(assetDocs.flatMap((doc) => (doc.exists ? [[doc.id, doc.data()!]] : [])));

    return rows
      .flatMap((row) => {
        const work = workById.get(row.workId);
        const asset = work?.assetId ? assetById.get(work.assetId) : undefined;
        if (!work || !asset) return [];
        return [
          {
            id: row.id,
            traceId,
            title: work.title,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            createdAt: row.createdAt,
          },
        ];
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async function linksFor(ownerId: string, traceId: string): Promise<LinkView[]> {
    const [outgoing, incoming] = await Promise.all([
      links.where("ownerId", "==", ownerId).where("traceId", "==", traceId).get(),
      links.where("ownerId", "==", ownerId).where("targetTraceId", "==", traceId).get(),
    ]);
    const rows = [...outgoing.docs, ...incoming.docs]
      .map((doc) => doc.data())
      .filter((row) => row.targetTraceId !== null);
    if (rows.length === 0) return [];

    const otherId = (row: (typeof rows)[number]) =>
      row.traceId === traceId ? row.targetTraceId! : row.traceId;
    const others = await db.getAll(...rows.map((row) => traces.doc(otherId(row))));
    const byId = new Map(others.flatMap((doc) => (doc.exists ? [[doc.id, doc.data()!]] : [])));

    return rows
      .flatMap((row) => {
        const other = byId.get(otherId(row));
        if (!other || other.ownerId !== ownerId) return [];
        return [
          {
            id: row.id,
            note: row.note,
            createdAt: row.createdAt,
            trace: { id: other.id, title: other.title, writtenOn: other.writtenOn },
          },
        ];
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async function getImageRecord(ownerId: string, traceId: string, imageId: string) {
    assertId(traceId);
    assertId(imageId);
    const attachment = (await attachments.doc(imageId).get()).data();
    if (!attachment || attachment.ownerId !== ownerId || attachment.targetTraceId !== traceId) {
      throw notFound();
    }
    const work = (await works.doc(attachment.workId).get()).data();
    const asset = work?.assetId ? (await assets.doc(work.assetId).get()).data() : undefined;
    if (!asset || asset.ownerId !== ownerId) throw notFound();
    return asset;
  }

  return {
    narrative: createNarrativeLayer(db),

    async createTrace(ownerId: string, input: unknown): Promise<TraceView> {
      const data = parse(TraceInputSchema, input);
      assertSize(data.body);
      const now = new Date();
      const trace: Trace = {
        id: randomUUID(),
        ownerId,
        visibility: "private",
        title: data.title ?? null,
        body: data.body,
        language: data.language ?? null,
        writtenOn: data.writtenOn,
        createdAt: now,
        updatedAt: now,
      };
      await traces.doc(trace.id).create(trace);
      return traceView(trace);
    },

    async listTraces(ownerId: string, options: ListOptions = {}): Promise<TracePage> {
      const limit = parseLimit(options.limit);
      const from = options.from ? parse(CalendarDate, options.from) : null;
      const to = options.to ? parse(CalendarDate, options.to) : null;
      if (from && to && from > to) throw invalid("from must not be after to");

      let query = traces.where("ownerId", "==", ownerId);
      if (from) query = query.where("writtenOn", ">=", from);
      if (to) query = query.where("writtenOn", "<=", to);
      query = query
        .orderBy("writtenOn", "desc")
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (options.cursor) query = query.startAfter(...decodeCursor(options.cursor));

      const found = await query.limit(limit + 1).get();
      const rows = found.docs.slice(0, limit).map((doc) => doc.data());
      const hasMore = found.docs.length > limit;
      return {
        items: rows.map(traceView),
        nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!) : null,
      };
    },

    async getTrace(ownerId: string, traceId: string): Promise<TraceDetail> {
      assertId(traceId);
      const trace = ownedTrace(await traces.doc(traceId).get(), ownerId);
      const [images, traceLinks] = await Promise.all([
        imagesFor(ownerId, traceId),
        linksFor(ownerId, traceId),
      ]);
      return { ...traceView(trace), images, links: traceLinks };
    },

    async updateTrace(ownerId: string, traceId: string, input: unknown): Promise<TraceView> {
      assertId(traceId);
      const patch = parse(TracePatchSchema, input);
      assertSize(patch.body);
      return db.runTransaction(async (tx) => {
        const trace = ownedTrace(await tx.get(traces.doc(traceId)), ownerId);
        const updated: Trace = { ...trace, ...patch, updatedAt: new Date() } as Trace;
        tx.set(traces.doc(traceId), updated);
        return traceView(updated);
      });
    },

    async deleteTrace(ownerId: string, traceId: string): Promise<void> {
      assertId(traceId);
      const objectKeys = await db.runTransaction(async (tx) => {
        const ref = traces.doc(traceId);
        ownedTrace(await tx.get(ref), ownerId);
        const attached = await tx.get(
          attachments.where("ownerId", "==", ownerId).where("targetTraceId", "==", traceId),
        );
        const plan = new DeletePlan(db, tx);
        await plan.remove("Trace", db.collection(collections.Trace).doc(traceId));
        for (const doc of attached.docs) await plan.removeImageWork(doc.data().workId);
        plan.apply(new Date());
        return plan.objectKeys;
      });
      await deleteObjects(objectKeys);
    },

    async addImage(
      ownerId: string,
      traceId: string,
      bytes: Uint8Array,
      filename?: string | null,
    ): Promise<ImageView> {
      assertId(traceId);
      ownedTrace(await traces.doc(traceId).get(), ownerId);
      if (bytes.length === 0) throw invalid("Image is empty");
      if (bytes.length > MAX_IMAGE_BYTES) throw new DataError(413, "Image is larger than 10 MB");
      const mimeType = detectImageType(bytes);
      if (!mimeType) throw new DataError(415, "Only JPEG, PNG, WebP, and GIF images are allowed");

      const title = filename?.trim().slice(0, MAX_IMAGE_TITLE_LENGTH) || "Image";
      const now = new Date();
      const assetId = randomUUID();
      const workId = randomUUID();
      const attachmentId = randomUUID();
      const objectKey = `images/${assetId}`;

      await blobs.put(objectKey, bytes, mimeType);
      try {
        await db.runTransaction(async (tx) => {
          ownedTrace(await tx.get(traces.doc(traceId)), ownerId);
          const owned = { ownerId, createdAt: now, updatedAt: now };
          tx.create(assets.doc(assetId), {
            ...owned,
            id: assetId,
            visibility: "private",
            bucket: blobs.bucket,
            objectKey,
            mimeType,
            byteSize: bytes.length,
            checksum: createHash("sha256").update(bytes).digest("base64"),
          });
          tx.create(works.doc(workId), {
            ...owned,
            id: workId,
            visibility: "private",
            forkedFromId: null,
            kind: "image",
            title,
            creator: null,
            dateLabel: null,
            provenance: "personal",
            rights: "unknown",
            url: null,
            assetId,
          } as never);
          tx.create(attachments.doc(attachmentId), {
            ...owned,
            id: attachmentId,
            workId,
            note: null,
            targetBeatId: null,
            targetVersionId: null,
            targetTraceId: traceId,
          });
        });
      } catch (error) {
        await deleteObjects([objectKey]);
        throw error;
      }
      return { id: attachmentId, traceId, title, mimeType, byteSize: bytes.length, createdAt: now };
    },

    async readImage(ownerId: string, traceId: string, imageId: string) {
      const asset = await getImageRecord(ownerId, traceId, imageId);
      return { bytes: await blobs.get(asset.objectKey), mimeType: asset.mimeType };
    },

    async deleteImage(ownerId: string, traceId: string, imageId: string): Promise<void> {
      assertId(traceId);
      assertId(imageId);
      const objectKeys = await db.runTransaction(async (tx) => {
        const ref = db.collection(collections.Attachment).doc(imageId);
        const attachment = (await tx.get(ref)).data();
        if (
          !attachment ||
          attachment.ownerId !== ownerId ||
          attachment.targetTraceId !== traceId
        ) {
          throw notFound();
        }
        const plan = new DeletePlan(db, tx);
        await plan.remove("Attachment", ref);
        await plan.removeImageWork(attachment.workId as string);
        plan.apply(new Date());
        return plan.objectKeys;
      });
      await deleteObjects(objectKeys);
    },

    async linkTraces(ownerId: string, traceId: string, input: unknown): Promise<LinkView> {
      assertId(traceId);
      const { traceId: otherId, note } = parse(LinkInputSchema, input);
      if (otherId === traceId) throw invalid("A trace cannot link to itself");
      const [low, high] = traceId < otherId ? [traceId, otherId] : [otherId, traceId];
      const id = stableId(ownerId, low, high);
      const now = new Date();

      return db.runTransaction(async (tx) => {
        const [self, other, existing] = await Promise.all([
          tx.get(traces.doc(traceId)),
          tx.get(traces.doc(otherId)),
          tx.get(links.doc(id)),
        ]);
        ownedTrace(self, ownerId);
        const target = ownedTrace(other, ownerId);
        if (existing.exists) throw conflict("These traces are already linked");
        tx.create(links.doc(id), {
          id,
          ownerId,
          traceId: low,
          targetBeatId: null,
          targetVersionId: null,
          targetTraceId: high,
          note: note ?? null,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id,
          note: note ?? null,
          createdAt: now,
          trace: { id: target.id, title: target.title, writtenOn: target.writtenOn },
        };
      });
    },

    async unlinkTraces(ownerId: string, traceId: string, linkDocId: string): Promise<void> {
      assertId(traceId);
      assertId(linkDocId);
      await db.runTransaction(async (tx) => {
        const ref = links.doc(linkDocId);
        const link = (await tx.get(ref)).data();
        if (
          !link ||
          link.ownerId !== ownerId ||
          (link.traceId !== traceId && link.targetTraceId !== traceId)
        ) {
          throw notFound();
        }
        tx.delete(ref);
      });
    },
  };
}

type FirebaseFirestoreSnapshot<T> = { data(): T | undefined };
