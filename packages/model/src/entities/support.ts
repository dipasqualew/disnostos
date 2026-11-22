import { arc, defineEntity, f } from "../dsl";

const group = "Support";

export const User = defineEntity({
  name: "User",
  group,
  description: "A person who owns content or reads what is shared with them.",
  scope: "root",
  fields: {
    email: f.text("Sign-in email.", { unique: true, ownerOnly: true }),
    displayName: f.text("Name shown to other users."),
  },
});

export const Asset = defineEntity({
  name: "Asset",
  group,
  description: "Metadata for one file in cloud storage.",
  scope: "object",
  fields: {
    bucket: f.text("Storage bucket.", { ownerOnly: true }),
    objectKey: f.text("Object path within the bucket.", { ownerOnly: true }),
    mimeType: f.text("IANA media type."),
    byteSize: f.bigint("File size in bytes."),
    checksum: f.text("Content checksum.", { optional: true }),
  },
  unique: [["bucket", "objectKey"]],
});

export const Work = defineEntity({
  name: "Work",
  group,
  description:
    "A creative or scholarly work, such as a poem, painting, play, or paper. It can be cited without hosting a copy.",
  scope: "object",
  fields: {
    kind: f.enum(
      ["poem", "image", "song", "play", "book", "film", "study", "other"],
      "What sort of work this is.",
    ),
    title: f.text("Title of the work."),
    creator: f.text("Author, artist, or attributed source.", { optional: true }),
    dateLabel: f.text("Human date, such as 'c. 441 BCE'.", { optional: true }),
    provenance: f.enum(["ancient", "modern", "personal"], "Where this work stands historically."),
    rights: f.enum(
      ["public_domain", "licensed", "in_copyright", "own_work", "unknown"],
      "Copyright status, which decides whether a copy may be shown publicly.",
    ),
    url: f.url("External link to the work.", { optional: true }),
    assetId: f.ref("Asset", "Hosted copy, when one may be stored.", { optional: true }),
  },
});

export const Citation = defineEntity({
  name: "Citation",
  group,
  description: "Records a Work as the source of a beat, wording, or version.",
  scope: "dependent",
  fields: {
    workId: f.ref("Work", "The cited work.", { onDelete: "restrict" }),
    locator: f.text("Where in the work, such as 'lines 441-525'.", { optional: true }),
    note: f.text("Why this source is cited.", { optional: true }),
  },
  arcs: { target: arc(["Beat", "Wording", "Version"], "The object this citation supports.") },
});

export const Attachment = defineEntity({
  name: "Attachment",
  group,
  description: "Places a Work alongside a beat, version, or trace.",
  scope: "dependent",
  fields: {
    workId: f.ref("Work", "The attached work."),
    note: f.text("Why this work belongs here.", { optional: true }),
  },
  arcs: { target: arc(["Beat", "Version", "Trace"], "The object this work is attached to.") },
});

export const Share = defineEntity({
  name: "Share",
  group,
  description: "Grants one user read access to a private object.",
  scope: "dependent",
  fields: {
    granteeId: f.ref("User", "The invited reader.", { sameOwner: false }),
  },
  arcs: {
    target: arc(
      ["Mythology", "Tradition", "Version", "Myth", "Journal", "Trace", "Figure", "Archetype", "Work"],
      "The object being shared.",
    ),
  },
  invariants: ["The grantee cannot be the owner.", "Shared objects remain private to everyone else."],
});
