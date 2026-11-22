import type { Fixture } from "./types";
import { validateFixture } from "./validate";

export type FixtureClient = { post(path: string, body: unknown): Promise<unknown> };

export type LoadedFixture = {
  /** Fixture key to created ID. Placements are keyed `version.key/beat.key`. */
  ids: ReadonlyMap<string, string>;
  /** The created ID for a key. Throws on an unknown key. */
  id(key: string): string;
};

/** A client for the real API. Pass `fetch` to run it against a handler or a fake. */
export function createHttpClient(options: {
  baseUrl: string;
  token: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}): FixtureClient {
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    async post(path, body) {
      const response = await send(`${base}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`POST ${path} failed with ${response.status}: ${await response.text()}`);
      }
      return response.json();
    },
  };
}

/** Reads the ID from a plain row, or from a row nested under `field`. */
function idOf(response: unknown, field?: string): string {
  const outer = response as Record<string, unknown> | null;
  const row = (field ? outer?.[field] : outer) as { id?: unknown } | null | undefined;
  if (typeof row?.id !== "string") throw new Error(`Response has no ${field ?? "row"} id`);
  return row.id;
}

/** Creates the fixture through the API, in dependency order, so every invariant is enforced. */
export async function loadFixture(client: FixtureClient, fixture: Fixture): Promise<LoadedFixture> {
  const errors = validateFixture(fixture);
  if (errors.length) throw new Error(`Invalid fixture:\n${errors.join("\n")}`);

  const ids = new Map<string, string>();
  const id = (key: string) => {
    const value = ids.get(key);
    if (value === undefined) throw new Error(`Unknown fixture key: ${key}`);
    return value;
  };

  for (const { key, name, description } of fixture.mythologies) {
    ids.set(key, idOf(await client.post("/mythologies", { name, description })));
  }
  for (const { key, name, description, mythologies } of fixture.traditions) {
    ids.set(key, idOf(await client.post("/traditions", { name, description }), "tradition"));
    for (const mythology of mythologies) {
      await client.post(`/mythologies/${id(mythology)}/traditions`, { traditionId: id(key) });
    }
  }
  for (const { key, title, summary } of fixture.myths) {
    ids.set(key, idOf(await client.post("/myths", { title, summary }), "myth"));
  }
  for (const { key, myth, label } of fixture.beats) {
    ids.set(key, idOf(await client.post("/beats", { mythId: id(myth), label }), "beat"));
  }
  for (const { key, beat, language, text, translatedFrom } of fixture.wordings) {
    const body = {
      beatId: id(beat),
      language,
      text,
      ...(translatedFrom === undefined ? {} : { translatedFromId: id(translatedFrom) }),
    };
    ids.set(key, idOf(await client.post("/wordings", body)));
  }
  for (const version of fixture.versions) {
    const { key, myth, title, description } = version;
    ids.set(key, idOf(await client.post("/versions", { mythId: id(myth), title, description }), "version"));
    for (const tradition of version.traditions) {
      await client.post(`/traditions/${id(tradition)}/versions`, { versionId: id(key) });
    }
    for (const row of version.beats) {
      const body = {
        beatId: id(row.beat),
        wordingId: id(row.wording),
        position: row.position,
        ...(row.note === undefined ? {} : { note: row.note }),
      };
      ids.set(`${key}/${row.beat}`, idOf(await client.post(`/versions/${id(key)}/beats`, body)));
    }
  }
  return { ids, id };
}
