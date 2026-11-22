import { arc, defineEntity, f } from "../dsl";

const group = "Narration";

const promotedFromTraceId = f.ref("Trace", "The trace this was promoted from.", {
  optional: true,
  ownerOnly: true,
});

export const Myth = defineEntity({
  name: "Myth",
  group,
  description: "A story and its pool of beats, such as Antigone.",
  scope: "object",
  forkable: true,
  fields: {
    title: f.text("Name of the story."),
    summary: f.text("Short description.", { optional: true }),
  },
  indexes: [[{ field: "createdAt", order: "desc" }]],
});

export const Beat = defineEntity({
  name: "Beat",
  group,
  description: "An atomic, language-independent story moment.",
  scope: "object",
  forkable: true,
  fields: {
    mythId: f.ref("Myth", "The myth whose pool holds this beat."),
    label: f.text("Short working label for the moment."),
  },
});

export const Wording = defineEntity({
  name: "Wording",
  group,
  description: "The text of a beat in one language.",
  scope: "object",
  forkable: true,
  fields: {
    beatId: f.ref("Beat", "The beat this expresses."),
    language: f.language("BCP 47 language tag."),
    text: f.text("The wording itself."),
    translatedFromId: f.ref("Wording", "The wording this translates.", { optional: true }),
    promotedFromTraceId,
  },
  invariants: ["translatedFromId must point to a wording of the same beat."],
});

export const WordingRevision = defineEntity({
  name: "WordingRevision",
  group,
  description: "An append-only snapshot of a wording.",
  scope: "dependent",
  fields: {
    wordingId: f.ref("Wording", "The revised wording."),
    number: f.int("Revision number, increasing per wording."),
    snapshot: f.json("The wording's content at this revision."),
  },
  unique: [["wordingId", "number"]],
  invariants: ["Revisions are never updated."],
});

export const Version = defineEntity({
  name: "Version",
  group,
  description: "One telling of a myth, such as Sophocles' Antigone.",
  scope: "object",
  forkable: true,
  fields: {
    mythId: f.ref("Myth", "The myth being told."),
    title: f.text("Name of this telling."),
    description: f.text("Context for this telling.", { optional: true }),
  },
  indexes: [[{ field: "createdAt", order: "desc" }]],
  invariants: [
    "Publishing a version requires its beats and chosen wordings to be public.",
  ],
});

export const VersionBeat = defineEntity({
  name: "VersionBeat",
  group,
  description: "Places a beat at a position in a version, with its chosen wording.",
  scope: "dependent",
  fields: {
    versionId: f.ref("Version", "The version."),
    beatId: f.ref("Beat", "The beat.", { onDelete: "restrict" }),
    wordingId: f.ref("Wording", "The wording this version uses.", { optional: true }),
    position: f.float("Sort key. Moving a beat assigns the midpoint of its new neighbours."),
    note: f.text("Note about this beat in this version.", { optional: true }),
  },
  unique: [["versionId", "position"]],
  invariants: [
    "The beat must belong to the version's myth.",
    "The wording must belong to the beat.",
  ],
});

export const VersionRevision = defineEntity({
  name: "VersionRevision",
  group,
  description: "An append-only snapshot of a version and its beat order.",
  scope: "dependent",
  fields: {
    versionId: f.ref("Version", "The revised version."),
    number: f.int("Revision number, increasing per version."),
    snapshot: f.json("The version's content and order at this revision."),
  },
  unique: [["versionId", "number"]],
  invariants: ["Revisions are never updated."],
});

export const Interpretation = defineEntity({
  name: "Interpretation",
  group,
  description: "The owner's reading of a version or a single beat.",
  scope: "object",
  forkable: true,
  fields: {
    title: f.text("Title of the reading.", { optional: true }),
    body: f.text("The interpretation."),
    language: f.language("BCP 47 language tag."),
    promotedFromTraceId,
  },
  arcs: { target: arc(["Version", "Beat"], "What is being interpreted.") },
});

export const Tradition = defineEntity({
  name: "Tradition",
  group,
  description: "A collection of versions, such as Orphic or 'my 20s'.",
  scope: "object",
  fields: {
    name: f.text("Name of the tradition."),
    description: f.text("What unites these versions.", { optional: true }),
  },
  indexes: [[{ field: "createdAt", order: "desc" }]],
});

export const TraditionVersion = defineEntity({
  name: "TraditionVersion",
  group,
  description: "Places a version in a tradition.",
  scope: "dependent",
  fields: {
    traditionId: f.ref("Tradition", "The tradition."),
    versionId: f.ref("Version", "The version."),
  },
  unique: [["traditionId", "versionId"]],
});

export const Mythology = defineEntity({
  name: "Mythology",
  group,
  description: "A collection of traditions, such as Greek or a personal mythology.",
  scope: "object",
  fields: {
    name: f.text("Name of the mythology."),
    description: f.text("What this mythology covers.", { optional: true }),
  },
  indexes: [[{ field: "createdAt", order: "desc" }]],
});

export const MythologyTradition = defineEntity({
  name: "MythologyTradition",
  group,
  description: "Places a tradition in a mythology.",
  scope: "dependent",
  fields: {
    mythologyId: f.ref("Mythology", "The mythology."),
    traditionId: f.ref("Tradition", "The tradition."),
  },
  unique: [["mythologyId", "traditionId"]],
});

export const Derivation = defineEntity({
  name: "Derivation",
  group,
  description: "A typed link between myths, versions, beats, or figures, across any mythologies.",
  scope: "dependent",
  fields: {
    kind: f.enum(
      ["retells", "echoes", "inverts", "borrows_from", "contradicts"],
      "How the source relates to the target.",
    ),
    note: f.text("Explains the connection.", { optional: true }),
  },
  arcs: {
    from: arc(["Myth", "Version", "Beat", "Figure"], "The owner's side of the link.", {
      onDelete: "keep",
    }),
    to: arc(["Myth", "Version", "Beat", "Figure"], "The linked object, which may be another user's.", {
      sameOwner: false,
      onDelete: "keep",
    }),
  },
  invariants: [
    "A viewer other than the owner sees a derivation only if they can see both ends.",
    "A public object never reveals that a private object links to it.",
    "Deleting either end, directly or through a cascade, never deletes the derivation: its kind, note, owner, and stored end references are kept.",
    "A deleted end counts as not visible.",
    "When the owner cannot see an end, they get a placeholder with the kind and note and nothing about that end, so a deleted object and another user's private object look the same.",
  ],
});
