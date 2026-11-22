import { createHash } from "node:crypto";
import { z } from "zod";
import { invalid } from "./errors";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw invalid(
    "Invalid request",
    result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
  );
}

export function parseLimit(value: string | null | undefined): number {
  if (value === null || value === undefined) return DEFAULT_PAGE_SIZE;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw invalid(`limit must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

/** A UUID derived from its parts, which turns a duplicate row into a document conflict. */
export function stableId(...parts: readonly string[]): string {
  const hash = createHash("sha256").update(parts.join("\n")).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x80;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
