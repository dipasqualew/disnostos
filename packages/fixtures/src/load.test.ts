import { describe, expect, test } from "bun:test";
import { createHttpClient, loadFixture, type FixtureClient } from "./load";
import { BEAT, MYTH, persephone, VERSION } from "./persephone";
import type { Fixture } from "./types";

const NESTED: Record<string, string> = {
  "/traditions": "tradition",
  "/myths": "myth",
  "/beats": "beat",
  "/versions": "version",
};

function fakeClient() {
  const calls: { path: string; body: any; id: string }[] = [];
  const client: FixtureClient = {
    async post(path, body) {
      const id = `id-${calls.length}`;
      calls.push({ path, body, id });
      const field = NESTED[path];
      return field ? { [field]: { id } } : { id };
    },
  };
  return { client, calls };
}

describe("loadFixture", () => {
  test("creates everything in order and maps keys to IDs", async () => {
    const { client, calls } = fakeClient();
    const loaded = await loadFixture(client, persephone);

    const memberships =
      persephone.traditions.flatMap((row) => row.mythologies).length +
      persephone.versions.flatMap((row) => row.traditions).length;
    const placements = persephone.versions.flatMap((row) => row.beats).length;
    expect(calls).toHaveLength(
      persephone.mythologies.length +
        persephone.traditions.length +
        persephone.myths.length +
        persephone.beats.length +
        persephone.wordings.length +
        persephone.versions.length +
        memberships +
        placements,
    );

    const beat = calls.find((call) => call.path === "/beats" && call.body.label === "The narcissus")!;
    expect(loaded.id(BEAT.narcissus)).toBe(beat.id);
    expect(beat.body.mythId).toBe(loaded.id(MYTH.persephone));

    const italian = calls.find((call) => call.path === "/wordings" && call.body.language === "it")!;
    expect(italian.body.translatedFromId).toBe(loaded.id("wording.narcissus.homeric"));

    const row = calls.find((call) => call.path === `/versions/${loaded.id(VERSION.ovid)}/beats`)!;
    expect(row.body).toMatchObject({
      beatId: loaded.id(BEAT.arrow),
      wordingId: loaded.id("wording.arrow.ovid"),
      position: 1024,
    });
    expect(loaded.id(`${VERSION.ovid}/${BEAT.arrow}`)).toBe(row.id);
    expect(() => loaded.id("beat.nowhere")).toThrow("Unknown fixture key");
  });

  test("refuses an invalid fixture before creating anything", async () => {
    const { client, calls } = fakeClient();
    const invalid: Fixture = { ...persephone, beats: [] };
    await expect(loadFixture(client, invalid)).rejects.toThrow("Invalid fixture");
    expect(calls).toHaveLength(0);
  });
});

describe("createHttpClient", () => {
  test("posts JSON with the bearer token and surfaces API errors", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const client = createHttpClient({
      baseUrl: "http://api.test/",
      token: "secret",
      fetch: async (url, init) => {
        requests.push({ url, init });
        return url.endsWith("/bad")
          ? new Response("nope", { status: 400 })
          : Response.json({ id: "1" }, { status: 201 });
      },
    });

    expect(await client.post("/myths", { title: "T" })).toEqual({ id: "1" });
    expect(requests[0]!.url).toBe("http://api.test/myths");
    expect(new Headers(requests[0]!.init.headers).get("Authorization")).toBe("Bearer secret");
    expect(requests[0]!.init.body).toBe('{"title":"T"}');
    await expect(client.post("/bad", {})).rejects.toThrow("POST /bad failed with 400: nope");
  });
});
