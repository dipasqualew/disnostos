import type { Derivation } from "@disnostos/model/schemas";
import { arcColumn, entities } from "@disnostos/model/spec";

type End = "from" | "to";
type EndColumn = `${End}${"Myth" | "Version" | "Beat" | "Figure"}Id`;

export type EndVisibility = Record<End, boolean>;

/** Holds only the ends the owner can see. A hidden end is null in every column. */
export type DerivationTombstone = Pick<Derivation, "id" | "kind" | "note" | "createdAt" | EndColumn>;

export type DerivationProjection =
  | { state: "full"; derivation: Omit<Derivation, "ownerId"> }
  | { state: "tombstone"; derivation: DerivationTombstone }
  | { state: "hidden" };

const arcs = entities.find((entity) => entity.name === "Derivation")!.arcs!;

const columns = (end: End) =>
  arcs[end]!.targets.map((target) => arcColumn(end, target) as EndColumn);

/**
 * Whether a viewer can see a derivation's end. A missing row and a row the viewer may not read
 * both give false, so nothing downstream can tell a deleted object from a private one.
 */
export function endVisibleTo(
  viewerId: string,
  end: { ownerId: string; visibility: string } | null | undefined,
  sharedWithViewer = false,
): boolean {
  if (!end) return false;
  return end.ownerId === viewerId || end.visibility === "public" || sharedWithViewer;
}

/** The only way a derivation may leave the data layer. Any future derivation route must use it. */
export function projectDerivation(
  viewerId: string,
  derivation: Derivation,
  visible: EndVisibility,
): DerivationProjection {
  if (visible.from && visible.to) {
    const { ownerId: _owner, ...rest } = derivation;
    return { state: "full", derivation: rest };
  }
  if (derivation.ownerId !== viewerId) return { state: "hidden" };

  // Built from an allowlist, so a field added to the model is not exposed by default.
  const { id, kind, note, createdAt } = derivation;
  const ends = Object.fromEntries(
    (["from", "to"] as const).flatMap((end) =>
      columns(end).map((column) => [column, visible[end] ? derivation[column] : null]),
    ),
  ) as Pick<Derivation, EndColumn>;
  return { state: "tombstone", derivation: { id, kind, note, createdAt, ...ends } };
}
