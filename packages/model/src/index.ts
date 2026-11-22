import type { Entity } from "./dsl";
import * as figures from "./entities/figures";
import * as narration from "./entities/narration";
import * as support from "./entities/support";
import * as tags from "./entities/tags";
import * as traces from "./entities/traces";

export * from "./dsl";

export const entities: readonly Entity[] = [
  ...Object.values(support),
  ...Object.values(narration),
  ...Object.values(figures),
  ...Object.values(traces),
  ...Object.values(tags),
];

/** Rules that span the whole model, enforced by the API data layer. */
export const globalRules: readonly string[] = [
  "Every object is private by default; making it public is an explicit opt-in.",
  "Objects reference only objects with the same owner. Using another user's public object forks it. Derivation and Tagging targets are the only exceptions.",
  "Publishing a parent requires publishing its children, after confirming the list with the owner.",
  "Owner-only fields never appear in responses to other users.",
  "Tags and taggings are visible only to their owner, even on public or shared objects.",
];
