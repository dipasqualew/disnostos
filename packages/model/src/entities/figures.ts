import { defineEntity, f } from "../dsl";

const group = "Figures";

export const Figure = defineEntity({
  name: "Figure",
  group,
  description: "A specific named thing in a story, such as Persephone, the Underworld, or the pomegranate.",
  scope: "object",
  forkable: true,
  fields: {
    kind: f.enum(["character", "place", "object"], "What sort of figure this is."),
    name: f.text("Primary name."),
    description: f.text("Who or what this is.", { optional: true }),
  },
});

export const FigureName = defineEntity({
  name: "FigureName",
  group,
  description: "Another name or language form of a figure, such as Kore or Proserpina.",
  scope: "dependent",
  fields: {
    figureId: f.ref("Figure", "The named figure."),
    language: f.language("BCP 47 language tag."),
    name: f.text("The name."),
  },
  unique: [["figureId", "language", "name"]],
});

export const Archetype = defineEntity({
  name: "Archetype",
  group,
  description: "A recurring abstract pattern, such as Seasonal Goddess or Descent.",
  scope: "object",
  forkable: true,
  fields: {
    kind: f.enum(["role", "setting", "symbol", "trope"], "What sort of pattern this is."),
    name: f.text("Name of the pattern."),
    description: f.text("What defines the pattern.", { optional: true }),
  },
});

export const FigureArchetype = defineEntity({
  name: "FigureArchetype",
  group,
  description:
    "Records that a figure embodies an archetype, either generally or within one tradition.",
  scope: "dependent",
  fields: {
    figureId: f.ref("Figure", "The figure."),
    archetypeId: f.ref("Archetype", "The archetype."),
    traditionId: f.ref("Tradition", "The tradition this holds in. Empty means it holds generally.", {
      optional: true,
      onDelete: "cascade",
    }),
    note: f.text("How the figure embodies it.", { optional: true }),
  },
  unique: [["figureId", "archetypeId", "traditionId"]],
});

export const BeatFigure = defineEntity({
  name: "BeatFigure",
  group,
  description: "Records that a figure appears in a beat.",
  scope: "dependent",
  fields: {
    beatId: f.ref("Beat", "The beat."),
    figureId: f.ref("Figure", "The figure."),
    note: f.text("The figure's part in this moment.", { optional: true }),
  },
  unique: [["beatId", "figureId"]],
});

export const BeatArchetype = defineEntity({
  name: "BeatArchetype",
  group,
  description: "Records that a beat enacts an archetype, such as a Descent.",
  scope: "dependent",
  fields: {
    beatId: f.ref("Beat", "The beat."),
    archetypeId: f.ref("Archetype", "The archetype."),
    note: f.text("How the beat enacts it.", { optional: true }),
  },
  unique: [["beatId", "archetypeId"]],
});
