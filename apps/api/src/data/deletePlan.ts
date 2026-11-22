import type { DocumentData, DocumentReference, Firestore, Transaction } from "@google-cloud/firestore";
import { collections } from "@disnostos/model/firestore";
import { allFields, entities, type EntityName, type OnDelete } from "@disnostos/model/spec";
import { conflict } from "./errors";

/** Firestore's limit on values in one `in` filter. */
const IN_LIMIT = 30;

type Referrer = { entity: EntityName; field: string; onDelete: Exclude<OnDelete, "keep"> };

/** Every field whose row a delete must act on, excluding ownership and `keep` references. */
function referrersOf(name: EntityName): Referrer[] {
  return entities.flatMap((entity) =>
    Object.entries(allFields(entity)).flatMap(([field, definition]) =>
      definition.type === "ref" &&
      definition.to === name &&
      field !== "ownerId" &&
      definition.onDelete !== "keep"
        ? [{ entity: entity.name, field, onDelete: definition.onDelete }]
        : [],
    ),
  );
}

export function chunks<T>(items: readonly T[], size = IN_LIMIT): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** The writes a delete implies. Built from reads, then applied, as transactions require. */
export class DeletePlan {
  readonly deletes = new Map<string, DocumentReference>();
  readonly clears = new Map<string, { ref: DocumentReference; fields: Set<string> }>();
  readonly objectKeys: string[] = [];
  /** Checked once the plan is complete, as a cascade may yet remove the referrer. */
  private readonly restricted = new Map<string, EntityName>();

  constructor(
    private readonly db: Firestore,
    private readonly tx: Transaction,
  ) {}

  /** Applies the model's onDelete rules, as Postgres foreign keys would have. */
  async remove(name: EntityName, ref: DocumentReference): Promise<void> {
    await this.removeAll(name, [ref]);
  }

  private async removeAll(name: EntityName, refs: readonly DocumentReference[]): Promise<void> {
    // A row can arrive twice, when two of its references lead to objects being deleted.
    const unique = new Map(refs.map((ref) => [ref.path, ref]));
    const fresh = [...unique.values()].filter((ref) => !this.deletes.has(ref.path));
    if (fresh.length === 0) return;
    for (const ref of fresh) this.deletes.set(ref.path, ref);

    const ids = fresh.map((ref) => ref.id);
    const found = await Promise.all(
      referrersOf(name).flatMap((referrer) =>
        chunks(ids).map(async (chunk) => ({
          referrer,
          docs: (
            await this.tx.get(
              this.db.collection(collections[referrer.entity]).where(referrer.field, "in", chunk),
            )
          ).docs,
        })),
      ),
    );

    const cascades = new Map<EntityName, DocumentReference[]>();
    for (const { referrer, docs } of found) {
      for (const doc of docs) {
        if (referrer.onDelete === "cascade") {
          cascades.set(referrer.entity, [...(cascades.get(referrer.entity) ?? []), doc.ref]);
        } else if (referrer.onDelete === "set null") {
          const entry = this.clears.get(doc.ref.path) ?? { ref: doc.ref, fields: new Set() };
          entry.fields.add(referrer.field);
          this.clears.set(doc.ref.path, entry);
        } else {
          this.restricted.set(doc.ref.path, referrer.entity);
        }
      }
    }
    for (const [entity, cascaded] of cascades) await this.removeAll(entity, cascaded);
  }

  /** Removes an uploaded image's Work, Asset, and file once nothing else uses them. */
  async removeImageWork(workId: string): Promise<void> {
    const { db, tx } = this;
    const workRef = db.collection(collections.Work).doc(workId);
    const [attachments, citations, workSnapshot] = await Promise.all([
      tx.get(db.collection(collections.Attachment).where("workId", "==", workId)),
      tx.get(db.collection(collections.Citation).where("workId", "==", workId)),
      tx.get(workRef),
    ]);
    const work = workSnapshot.data();
    if (!work || work.kind !== "image" || !citations.empty) return;
    if (attachments.docs.some((doc) => !this.deletes.has(doc.ref.path))) return;

    await this.remove("Work", workRef);
    if (typeof work.assetId !== "string") return;

    const users = await tx.get(
      db.collection(collections.Work).where("assetId", "==", work.assetId),
    );
    if (users.docs.some((doc) => !this.deletes.has(doc.ref.path))) return;
    const assetRef = db.collection(collections.Asset).doc(work.assetId);
    const asset = (await tx.get(assetRef)).data();
    if (!asset) return;
    await this.remove("Asset", assetRef);
    this.objectKeys.push(asset.objectKey as string);
  }

  apply(now: Date): void {
    for (const [path, entity] of this.restricted) {
      if (!this.deletes.has(path)) throw conflict(`Still referenced by ${entity}`);
    }
    for (const ref of this.deletes.values()) this.tx.delete(ref);
    for (const { ref, fields } of this.clears.values()) {
      if (this.deletes.has(ref.path)) continue;
      const update: DocumentData = { updatedAt: now };
      for (const field of fields) update[field] = null;
      this.tx.update(ref, update);
    }
  }
}
