// Runs against the Firestore emulator, and is skipped without one. The REST client
// still looks for credentials, so a local `gcloud auth application-default login`
// is needed; the emulator ignores them and nothing reaches GCP.
//   docker run --rm -p 8686:8686 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators \
//     gcloud emulators firestore start --host-port=0.0.0.0:8686
//   FIRESTORE_EMULATOR_HOST=localhost:8686 bun test
import { beforeEach, describe, expect, test } from "bun:test";
import { Firestore } from "@google-cloud/firestore";
import { collections } from "@disnostos/model/firestore";
import { createHandler, parseAllowedOrigins } from "../handler";
import type { BlobStore } from "./blobs";
import { MAX_IMAGE_BYTES } from "./images";
import { createDataLayer } from "./traces";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function memoryBlobs() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const store: BlobStore & { objects: typeof objects; failPut: boolean } = {
    bucket: "test-bucket",
    objects,
    failPut: false,
    async put(key, bytes, contentType) {
      if (store.failPut) throw new Error("put failed");
      objects.set(key, { bytes, contentType });
    },
    async get(key) {
      return objects.get(key)!.bytes;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return store;
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("traces API (Firestore emulator)", () => {
  const db = new Firestore({ projectId: "demo-disnostos", preferRest: true });
  let blobs = memoryBlobs();
  let handler = createHandler(new Set(), verify, createDataLayer(db, blobs));

  async function verify(token: string) {
    if (token !== "alice" && token !== "bob") throw new Error("bad token");
    return { uid: `uid-${token}`, email: null };
  }

  const call = (user: string | null, method: string, path: string, body?: unknown) =>
    handler(
      new Request(`http://api.test${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${user}` } : {}),
          ...(body !== undefined && !(body instanceof Uint8Array)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: body instanceof Uint8Array ? body : body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  async function makeTrace(user: string, writtenOn = "2026-11-22", title = "Entry") {
    const response = await call(user, "POST", "/traces", { title, body: "Words", writtenOn });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; writtenOn: string };
  }

  const count = async (name: keyof typeof collections) =>
    (await db.collection(collections[name]).count().get()).data().count;

  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-disnostos/databases/(default)/documents`,
      { method: "DELETE" },
    );
    blobs = memoryBlobs();
    handler = createHandler(new Set(), verify, createDataLayer(db, blobs));
  });

  test("every route requires a token", async () => {
    const id = crypto.randomUUID();
    for (const [method, path] of [
      ["GET", "/traces"],
      ["POST", "/traces"],
      ["GET", `/traces/${id}`],
      ["PATCH", `/traces/${id}`],
      ["DELETE", `/traces/${id}`],
      ["POST", `/traces/${id}/images`],
      ["GET", `/traces/${id}/images/${id}`],
      ["DELETE", `/traces/${id}/images/${id}`],
      ["POST", `/traces/${id}/links`],
      ["DELETE", `/traces/${id}/links/${id}`],
    ] as const) {
      expect((await call(null, method, path)).status).toBe(401);
    }
  });

  test("creates, reads, edits, and deletes a trace", async () => {
    const trace = await makeTrace("alice");
    expect(trace).not.toHaveProperty("ownerId");

    const patched = await call("alice", "PATCH", `/traces/${trace.id}`, {
      body: "Edited",
      writtenOn: "2026-11-21",
      title: null,
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ body: "Edited", writtenOn: "2026-11-21", title: null });

    const read = await (await call("alice", "GET", `/traces/${trace.id}`)).json();
    expect(read).toMatchObject({ body: "Edited", images: [], links: [] });

    expect((await call("alice", "DELETE", `/traces/${trace.id}`)).status).toBe(204);
    expect((await call("alice", "GET", `/traces/${trace.id}`)).status).toBe(404);
  });

  test("requires a real date and rejects unknown or private fields", async () => {
    for (const body of [
      { body: "x" },
      { body: "x", writtenOn: "2026-02-30" },
      { body: "x", writtenOn: "2026-11-22T10:00:00Z" },
      { body: "x", writtenOn: "2026-11-22", ownerId: "uid-bob" },
      { body: "x", writtenOn: "2026-11-22", visibility: "public" },
    ]) {
      expect((await call("alice", "POST", "/traces", body)).status).toBe(400);
    }
  });

  test("lists newest first, paginates without gaps, and filters by date", async () => {
    await makeTrace("alice", "2026-11-20", "a");
    await makeTrace("alice", "2026-11-22", "b");
    await makeTrace("alice", "2026-11-22", "c");
    await makeTrace("alice", "2026-11-21", "d");
    await makeTrace("bob", "2026-11-23", "other");

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : "";
      const page = (await (await call("alice", "GET", `/traces?limit=3${query}`)).json()) as {
        items: { title: string; writtenOn: string }[];
        nextCursor: string | null;
      };
      seen.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    expect(seen.slice(2)).toEqual(["d", "a"]);

    const ranged = (await (
      await call("alice", "GET", "/traces?from=2026-11-21&to=2026-11-21")
    ).json()) as { items: { title: string }[] };
    expect(ranged.items.map((item) => item.title)).toEqual(["d"]);

    for (const query of ["from=nope", "from=2026-11-22&to=2026-11-21", "limit=0", "limit=101", "cursor=nope"]) {
      expect((await call("alice", "GET", `/traces?${query}`)).status).toBe(400);
    }
  });

  test("another user's objects are 404 everywhere", async () => {
    const trace = await makeTrace("alice");
    const mine = await makeTrace("bob");
    const image = (await (await call("alice", "POST", `/traces/${trace.id}/images`, PNG)).json()) as { id: string };

    expect((await call("bob", "GET", `/traces/${trace.id}`)).status).toBe(404);
    expect((await call("bob", "PATCH", `/traces/${trace.id}`, { body: "x" })).status).toBe(404);
    expect((await call("bob", "DELETE", `/traces/${trace.id}`)).status).toBe(404);
    expect((await call("bob", "POST", `/traces/${trace.id}/images`, PNG)).status).toBe(404);
    expect((await call("bob", "GET", `/traces/${trace.id}/images/${image.id}`)).status).toBe(404);
    expect((await call("bob", "DELETE", `/traces/${trace.id}/images/${image.id}`)).status).toBe(404);
    expect((await call("bob", "GET", `/traces/${mine.id}/images/${image.id}`)).status).toBe(404);
    expect((await call("bob", "POST", `/traces/${mine.id}/links`, { traceId: trace.id })).status).toBe(404);
    expect((await call("alice", "GET", `/traces/${trace.id}`)).status).toBe(200);
    expect(blobs.objects.size).toBe(1);
  });

  test("links are undirected, unique, and removed with either trace", async () => {
    const a = await makeTrace("alice", "2026-11-20", "A");
    const b = await makeTrace("alice", "2026-11-21", "B");
    const c = await makeTrace("alice", "2026-11-22", "C");

    expect((await call("alice", "POST", `/traces/${a.id}/links`, { traceId: a.id })).status).toBe(400);
    const created = await call("alice", "POST", `/traces/${a.id}/links`, { traceId: b.id, note: "echo" });
    expect(created.status).toBe(201);
    const link = (await created.json()) as { id: string };
    expect((await call("alice", "POST", `/traces/${b.id}/links`, { traceId: a.id })).status).toBe(409);

    const fromA = (await (await call("alice", "GET", `/traces/${a.id}`)).json()) as any;
    const fromB = (await (await call("alice", "GET", `/traces/${b.id}`)).json()) as any;
    expect(fromA.links[0]).toMatchObject({ id: link.id, note: "echo", trace: { id: b.id, title: "B" } });
    expect(fromB.links[0]).toMatchObject({ id: link.id, trace: { id: a.id, title: "A" } });

    expect((await call("alice", "DELETE", `/traces/${c.id}/links/${link.id}`)).status).toBe(404);
    expect((await call("alice", "DELETE", `/traces/${b.id}/links/${link.id}`)).status).toBe(204);
    expect(await count("TraceLink")).toBe(0);

    await call("alice", "POST", `/traces/${b.id}/links`, { traceId: a.id });
    await call("alice", "POST", `/traces/${c.id}/links`, { traceId: a.id });
    expect(await count("TraceLink")).toBe(2);
    await call("alice", "DELETE", `/traces/${a.id}`);
    expect(await count("TraceLink")).toBe(0);
    expect((await (await call("alice", "GET", `/traces/${b.id}`)).json() as any).links).toEqual([]);
  });

  test("stores each allowed image type from its bytes and serves it safely", async () => {
    const trace = await makeTrace("alice");
    for (const [bytes, type] of [
      [PNG, "image/png"],
      [JPEG, "image/jpeg"],
      [GIF, "image/gif"],
      [WEBP, "image/webp"],
    ] as const) {
      const response = await call("alice", "POST", `/traces/${trace.id}/images?filename=sea.png`, bytes);
      expect(response.status).toBe(201);
      const image = (await response.json()) as { id: string; mimeType: string };
      expect(image.mimeType).toBe(type);
      const served = await call("alice", "GET", `/traces/${trace.id}/images/${image.id}`);
      expect(served.headers.get("Content-Type")).toBe(type);
      expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(served.headers.get("Cache-Control")).toContain("private");
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
    const detail = (await (await call("alice", "GET", `/traces/${trace.id}`)).json()) as any;
    expect(detail.images).toHaveLength(4);
    expect(JSON.stringify(detail)).not.toContain("objectKey");
    for (const key of blobs.objects.keys()) expect(key).toMatch(/^images\/[0-9a-f-]{36}$/);
  });

  test("rejects spoofed, SVG, empty, and oversize uploads without storing them", async () => {
    const trace = await makeTrace("alice");
    const spoofed = new Request(`http://api.test/traces/${trace.id}/images`, {
      method: "POST",
      headers: { Authorization: "Bearer alice", "Content-Type": "image/png" },
      body: SVG,
    });
    expect((await handler(spoofed)).status).toBe(415);
    expect((await call("alice", "POST", `/traces/${trace.id}/images`, new TextEncoder().encode("<html>"))).status).toBe(415);
    expect((await call("alice", "POST", `/traces/${trace.id}/images`, new Uint8Array())).status).toBe(400);

    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect((await call("alice", "POST", `/traces/${trace.id}/images`, big)).status).toBe(413);
    const exact = big.slice(0, MAX_IMAGE_BYTES);
    expect((await call("alice", "POST", `/traces/${trace.id}/images`, exact)).status).toBe(201);
    expect(blobs.objects.size).toBe(1);
  });

  test("deleting an image or its trace removes metadata and files", async () => {
    const trace = await makeTrace("alice");
    const first = (await (await call("alice", "POST", `/traces/${trace.id}/images`, PNG)).json()) as { id: string };
    await call("alice", "POST", `/traces/${trace.id}/images`, JPEG);
    expect(blobs.objects.size).toBe(2);

    expect((await call("alice", "DELETE", `/traces/${trace.id}/images/${first.id}`)).status).toBe(204);
    expect(blobs.objects.size).toBe(1);
    expect(await count("Asset")).toBe(1);

    expect((await call("alice", "DELETE", `/traces/${trace.id}`)).status).toBe(204);
    expect(blobs.objects.size).toBe(0);
    for (const name of ["Trace", "Asset", "Work", "Attachment"] as const) {
      expect(await count(name)).toBe(0);
    }
  });

  test("a failed metadata write leaves no stored file", async () => {
    const trace = await makeTrace("alice");
    const failing = createDataLayer(
      new Proxy(db, {
        get: (target, key) =>
          key === "runTransaction"
            ? () => Promise.reject(new Error("write failed"))
            : Reflect.get(target, key, target),
      }),
      blobs,
    );
    await expect(failing.addImage("uid-alice", trace.id, PNG)).rejects.toThrow("write failed");
    expect(blobs.objects.size).toBe(0);
  });

  test("a storage failure is a generic 500", async () => {
    const trace = await makeTrace("alice");
    blobs.failPut = true;
    const response = await call("alice", "POST", `/traces/${trace.id}/images`, PNG);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal Server Error" });
    expect(await count("Asset")).toBe(0);
  });
});
