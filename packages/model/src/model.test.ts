import { describe, expect, test } from "bun:test";
import {
  DerivationCreateSchema,
  FigureCreateSchema,
  WordingPublicSchema,
  WorkCreateSchema,
} from "../generated/schemas";
import * as schemas from "../generated/schemas";
import { isCurrent } from "../scripts/generate";
import { allFields, entities } from "./index";

const id = "7d444840-9dc0-41d3-9a6f-0d5c5f7f1a11";

describe("model", () => {
  test("generated files match the entity definitions", () => {
    expect(isCurrent()).toBe(true);
  });

  test("entity names are unique and every reference resolves", () => {
    const names = new Set(entities.map((entity) => entity.name));
    expect(names.size).toBe(entities.length);
    for (const entity of entities) {
      for (const field of Object.values(allFields(entity))) {
        if (field.type === "ref") expect(names.has(field.to)).toBe(true);
      }
    }
  });

  test("objects default to private and clients cannot set the owner", () => {
    const figure = { kind: "character", name: "Persephone" };
    expect(FigureCreateSchema.parse(figure).visibility).toBe("private");
    expect(FigureCreateSchema.safeParse({ ...figure, ownerId: id }).success).toBe(false);
  });

  test("public schemas strip owner-only fields", () => {
    const now = new Date();
    const parsed = WordingPublicSchema.parse({
      id,
      ownerId: id,
      visibility: "public",
      forkedFromId: id,
      beatId: id,
      language: "en",
      text: "Persephone eats the pomegranate seeds.",
      translatedFromId: null,
      promotedFromTraceId: id,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed).not.toHaveProperty("promotedFromTraceId");
    expect(parsed).not.toHaveProperty("forkedFromId");
  });

  test("tags have no public representation", () => {
    expect(schemas).not.toHaveProperty("TagPublicSchema");
    expect(schemas).not.toHaveProperty("TaggingPublicSchema");
  });

  test("arcs require exactly one target", () => {
    const base = { kind: "echoes", fromVersionId: id };
    expect(DerivationCreateSchema.safeParse({ ...base, toMythId: id }).success).toBe(true);
    expect(DerivationCreateSchema.safeParse(base).success).toBe(false);
    expect(
      DerivationCreateSchema.safeParse({ ...base, toMythId: id, toBeatId: id }).success,
    ).toBe(false);
  });

  test("work URLs must be http or https", () => {
    const work = { kind: "poem", title: "Sonnet", provenance: "modern", rights: "unknown" };
    expect(WorkCreateSchema.safeParse({ ...work, url: "https://example.com" }).success).toBe(true);
    expect(WorkCreateSchema.safeParse({ ...work, url: "javascript:alert(1)" }).success).toBe(false);
  });
});
