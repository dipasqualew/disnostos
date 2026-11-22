import { describe, expect, test } from "bun:test";
import type { Derivation } from "@disnostos/model/schemas";
import { endVisibleTo, projectDerivation } from "./derivationView";

const fromId = "11111111-1111-4111-8111-111111111111";
const toId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-01-01T00:00:00Z");

const derivation: Derivation = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerId: "alice",
  kind: "echoes",
  note: "My note",
  fromMythId: fromId,
  fromVersionId: null,
  fromBeatId: null,
  fromFigureId: null,
  toMythId: null,
  toVersionId: null,
  toBeatId: toId,
  toFigureId: null,
  createdAt,
  updatedAt: new Date("2026-02-02T00:00:00Z"),
};

describe("endVisibleTo", () => {
  test("a missing end is never visible", () => {
    expect(endVisibleTo("alice", null)).toBe(false);
    expect(endVisibleTo("alice", undefined, true)).toBe(false);
  });

  test("owners, public objects, and share grantees can see an end", () => {
    expect(endVisibleTo("alice", { ownerId: "alice", visibility: "private" })).toBe(true);
    expect(endVisibleTo("alice", { ownerId: "bob", visibility: "public" })).toBe(true);
    expect(endVisibleTo("alice", { ownerId: "bob", visibility: "private" }, true)).toBe(true);
    expect(endVisibleTo("alice", { ownerId: "bob", visibility: "private" })).toBe(false);
  });
});

describe("projectDerivation", () => {
  test("anyone who can see both ends gets the link, without its owner", () => {
    for (const viewer of ["alice", "bob"]) {
      const projected = projectDerivation(viewer, derivation, { from: true, to: true });
      expect(projected.state).toBe("full");
      if (projected.state !== "full") throw new Error("unreachable");
      expect(projected.derivation).toMatchObject({ fromMythId: fromId, toBeatId: toId, note: "My note" });
      expect(projected.derivation).not.toHaveProperty("ownerId");
    }
  });

  test("a non-owner who cannot see an end gets nothing at all", () => {
    for (const visible of [
      { from: false, to: true },
      { from: true, to: false },
      { from: false, to: false },
    ]) {
      expect(projectDerivation("bob", derivation, visible)).toEqual({ state: "hidden" });
    }
  });

  test("the owner's tombstone keeps the kind and note and only the visible end", () => {
    expect(projectDerivation("alice", derivation, { from: true, to: false })).toEqual({
      state: "tombstone",
      derivation: {
        id: derivation.id,
        kind: "echoes",
        note: "My note",
        createdAt,
        fromMythId: fromId,
        fromVersionId: null,
        fromBeatId: null,
        fromFigureId: null,
        toMythId: null,
        toVersionId: null,
        toBeatId: null,
        toFigureId: null,
      },
    });
  });

  test("a tombstone reveals neither the hidden end's ID, its type, nor the owner", () => {
    const tombstone = projectDerivation("alice", derivation, { from: false, to: false });
    const text = JSON.stringify(tombstone);
    expect(text).not.toContain(fromId);
    expect(text).not.toContain(toId);
    expect(text).not.toContain('"ownerId"');
    expect(text).not.toContain('"updatedAt"');

    const asFigure = { ...derivation, toBeatId: null, toFigureId: toId };
    expect(projectDerivation("alice", asFigure, { from: true, to: false })).toEqual(
      projectDerivation("alice", derivation, { from: true, to: false }),
    );
  });

  test("another user's deleted and private ends project identically", () => {
    const deleted = endVisibleTo("alice", null);
    const madePrivate = endVisibleTo("alice", { ownerId: "bob", visibility: "private" });
    expect(projectDerivation("alice", derivation, { from: true, to: deleted })).toEqual(
      projectDerivation("alice", derivation, { from: true, to: madePrivate }),
    );
  });
});
