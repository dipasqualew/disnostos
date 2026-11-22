export type EntityName =
  | "User"
  | "Asset"
  | "Work"
  | "Citation"
  | "Attachment"
  | "Myth"
  | "Beat"
  | "Wording"
  | "WordingRevision"
  | "Version"
  | "VersionBeat"
  | "VersionRevision"
  | "Interpretation"
  | "Tradition"
  | "TraditionVersion"
  | "Mythology"
  | "MythologyTradition"
  | "Figure"
  | "FigureName"
  | "Archetype"
  | "FigureArchetype"
  | "BeatFigure"
  | "BeatArchetype"
  | "Trace"
  | "Journal"
  | "JournalTrace"
  | "TraceLink"
  | "Derivation"
  | "Share"
  | "Tag"
  | "Tagging";

export type ScalarType =
  | "text"
  | "url"
  | "language"
  | "int"
  | "bigint"
  | "float"
  | "timestamp"
  | "json";

export type OnDelete = "cascade" | "restrict" | "set null";

interface FieldBase {
  description: string;
  optional: boolean;
  /** Excluded from the generated public read schema. */
  ownerOnly: boolean;
  unique: boolean;
}

export interface ScalarField extends FieldBase {
  type: ScalarType;
}

export interface EnumField extends FieldBase {
  type: "enum";
  values: readonly [string, ...string[]];
}

export interface RefField extends FieldBase {
  type: "ref";
  to: EntityName;
  onDelete: OnDelete;
  /** Required refs enforce this in Postgres; optional refs in the API data layer. */
  sameOwner: boolean;
}

export type Field = ScalarField | EnumField | RefField;

export interface Arc {
  description: string;
  targets: readonly [EntityName, EntityName, ...EntityName[]];
  sameOwner: boolean;
}

/**
 * - `root`: has no owner (User).
 * - `object`: owned, with its own private/public visibility.
 * - `dependent`: owned, and visible according to the objects it connects.
 * - `personal`: owned, and never visible to anyone else. Has no public schema.
 */
export type Scope = "root" | "object" | "dependent" | "personal";

export interface Entity {
  name: EntityName;
  group: string;
  description: string;
  scope: Scope;
  /** Adds an owner-only `forkedFromId`, which may point at another user's object. */
  forkable?: boolean;
  fields: Record<string, Field>;
  /** Exactly one target must be set. Expands to `<arc><Target>Id` columns. */
  arcs?: Record<string, Arc>;
  /** Column or arc names. Nulls compare equal when any expanded column is optional. */
  unique?: readonly (readonly string[])[];
  /** Rules the database cannot enforce, which the API data layer must. */
  invariants?: readonly string[];
}

export const defineEntity = (entity: Entity): Entity => entity;

type Options = Partial<Pick<FieldBase, "optional" | "ownerOnly" | "unique">>;

const base = (description: string, options: Options = {}): FieldBase => ({
  description,
  optional: options.optional ?? false,
  ownerOnly: options.ownerOnly ?? false,
  unique: options.unique ?? false,
});

const scalar =
  (type: ScalarType) =>
  (description: string, options?: Options): ScalarField => ({
    ...base(description, options),
    type,
  });

export const f = {
  text: scalar("text"),
  url: scalar("url"),
  language: scalar("language"),
  int: scalar("int"),
  bigint: scalar("bigint"),
  float: scalar("float"),
  timestamp: scalar("timestamp"),
  json: scalar("json"),
  enum: (
    values: readonly [string, ...string[]],
    description: string,
    options?: Options,
  ): EnumField => ({ ...base(description, options), type: "enum", values }),
  ref: (
    to: EntityName,
    description: string,
    options: Options & { onDelete?: OnDelete; sameOwner?: boolean } = {},
  ): RefField => ({
    ...base(description, options),
    type: "ref",
    to,
    onDelete: options.onDelete ?? (options.optional ? "set null" : "cascade"),
    sameOwner: options.sameOwner ?? true,
  }),
};

export const arc = (
  targets: Arc["targets"],
  description: string,
  options: { sameOwner?: boolean } = {},
): Arc => ({ targets, description, sameOwner: options.sameOwner ?? true });

export const VISIBILITY = ["private", "public"] as const;

export const arcColumn = (arcName: string, target: EntityName): string =>
  `${arcName}${target}Id`;

/** The complete field list of an entity, including implied columns. */
export function allFields(entity: Entity): Record<string, Field> {
  const fields: Record<string, Field> = {};

  if (entity.scope !== "root") {
    fields.ownerId = f.ref("User", "The user who owns this row.", { sameOwner: false });
  }
  if (entity.scope === "object") {
    fields.visibility = f.enum(VISIBILITY, "Private by default; public is opt-in.");
  }
  if (entity.forkable) {
    fields.forkedFromId = f.ref(entity.name, "The object this was forked from.", {
      optional: true,
      ownerOnly: true,
      sameOwner: false,
    });
  }
  Object.assign(fields, entity.fields);

  for (const [arcName, definition] of Object.entries(entity.arcs ?? {})) {
    for (const target of definition.targets) {
      fields[arcColumn(arcName, target)] = f.ref(target, definition.description, {
        optional: true,
        onDelete: "cascade",
        sameOwner: definition.sameOwner,
      });
    }
  }
  return fields;
}
