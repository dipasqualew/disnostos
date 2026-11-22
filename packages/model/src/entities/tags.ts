import { arc, defineEntity, f } from "../dsl";

const group = "Organisation";

export const Tag = defineEntity({
  name: "Tag",
  group,
  description: "A private, freeform label for organising the owner's content. It carries no mythological meaning.",
  scope: "personal",
  fields: {
    name: f.text("The label."),
  },
  unique: [["ownerId", "name"]],
});

export const Tagging = defineEntity({
  name: "Tagging",
  group,
  description: "Applies a tag to any object its owner can see, including another user's.",
  scope: "personal",
  fields: {
    tagId: f.ref("Tag", "The tag."),
  },
  arcs: {
    target: arc(
      [
        "Asset",
        "Work",
        "Myth",
        "Beat",
        "Wording",
        "Version",
        "Interpretation",
        "Tradition",
        "Mythology",
        "Figure",
        "Archetype",
        "Trace",
        "Journal",
      ],
      "The tagged object, which may be another user's.",
      { sameOwner: false },
    ),
  },
  unique: [["tagId", "target"]],
  invariants: [
    "The tagger must be able to see the target when tagging it.",
    "If the target stops being visible to the tagger, the tagging is kept but hidden, and reveals nothing about the target.",
    "A target's owner never learns that it was tagged, including through counts.",
  ],
});
