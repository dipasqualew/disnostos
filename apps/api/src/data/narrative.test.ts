// The API tests run against the Firestore emulator, and are skipped without one.
// See traces.test.ts for how to start it. The placement and auth tests always run.
import { beforeEach, describe, expect, test } from "bun:test";
import { Firestore, type FirestoreDataConverter } from "@google-cloud/firestore";
import { collections, converters } from "@disnostos/model/firestore";
import type { Derivation, VersionBeat } from "@disnostos/model/schemas";
import { arcColumn, entities, type EntityName } from "@disnostos/model/spec";
import { createHandler } from "../handler";
import type { BlobStore } from "./blobs";
import { DeletePlan } from "./deletePlan";
import { endVisibleTo, projectDerivation, type DerivationTombstone } from "./derivationView";
import { placeBeat } from "./narrative";
import { createDataLayer } from "./traces";

const blobs: BlobStore = {
  bucket: "test-bucket",
  put: async () => {},
  get: async () => new Uint8Array(),
  delete: async () => {},
};

async function verify(token: string) {
  if (token !== "alice" && token !== "bob") throw new Error("bad token");
  return { uid: `uid-${token}`, email: null };
}

const row = (id: string, position: number) => ({ id, position }) as VersionBeat;

describe("placeBeat", () => {
  const rows = [row("a", 1024), row("b", 2048)];

  test("appends by default and starts an empty version", () => {
    expect(placeBeat([], {})).toEqual({ position: 1024, shifted: [] });
    expect(placeBeat(rows, {}).position).toBe(3072);
  });

  test("afterId null goes first, and afterId takes the midpoint", () => {
    expect(placeBeat(rows, { afterId: null }).position).toBe(0);
    expect(placeBeat(rows, { afterId: "a" }).position).toBe(1536);
    expect(placeBeat(rows, { afterId: "b" }).position).toBe(3072);
  });

  test("rejects an unknown neighbour and a taken position", () => {
    expect(() => placeBeat(rows, { afterId: "nope" })).toThrow("afterId");
    expect(() => placeBeat(rows, { position: 1024 })).toThrow("position");
    expect(placeBeat(rows, { position: 5 })).toEqual({ position: 5, shifted: [] });
  });

  test("respaces the version when floats get too close, keeping the order", () => {
    const tight = [row("a", 1), row("b", 1 + 1e-7), row("c", 9)];
    const { position, shifted } = placeBeat(tight, { afterId: "a" });
    expect(position).toBe(2048);
    expect(shifted.map(({ id, position: at }) => [id, at])).toEqual([
      ["a", 1024],
      ["b", 3072],
      ["c", 4096],
    ]);
  });

  test("survives repeated insertion at the same spot", () => {
    let order = [row("first", 1024), row("last", 2048)];
    for (let index = 0; index < 200; index += 1) {
      const { position, shifted } = placeBeat(order, { afterId: "first" });
      const moved = new Map(shifted.map((item) => [item.id, item]));
      order = [...order.map((item) => moved.get(item.id) ?? item), row(`n${index}`, position)].sort(
        (a, b) => a.position - b.position,
      );
      expect(new Set(order.map((item) => item.position)).size).toBe(order.length);
      expect(order[0]!.id).toBe("first");
      expect(order[1]!.id).toBe(`n${index}`);
      expect(order.at(-1)!.id).toBe("last");
    }
  });
});

describe("narrative auth", () => {
  const handler = createHandler(
    new Set(),
    verify,
    createDataLayer(new Firestore({ projectId: "demo-disnostos", preferRest: true }), blobs),
  );
  const id = crypto.randomUUID();

  test("every route requires a token", async () => {
    const routes: [string, string][] = [];
    for (const root of ["myths", "beats", "wordings", "versions", "traditions", "mythologies"]) {
      routes.push(
        ["GET", `/${root}`],
        ["POST", `/${root}`],
        ["GET", `/${root}/${id}`],
        ["PATCH", `/${root}/${id}`],
        ["DELETE", `/${root}/${id}`],
      );
    }
    routes.push(
      ["GET", `/myths/${id}/full`],
      ["GET", `/myths/${id}/beats`],
      ["POST", `/myths/${id}/beats`],
      ["GET", `/myths/${id}/versions`],
      ["POST", `/myths/${id}/versions`],
      ["GET", `/beats/${id}/wordings`],
      ["POST", `/beats/${id}/wordings`],
      ["GET", `/versions/${id}/beats`],
      ["POST", `/versions/${id}/beats`],
      ["PATCH", `/versions/${id}/beats/${id}`],
      ["DELETE", `/versions/${id}/beats/${id}`],
      ["POST", `/traditions/${id}/versions`],
      ["DELETE", `/traditions/${id}/versions/${id}`],
      ["POST", `/mythologies/${id}/traditions`],
      ["DELETE", `/mythologies/${id}/traditions/${id}`],
    );
    for (const [method, path] of routes) {
      const response = await handler(new Request(`http://api.test${path}`, { method }));
      expect(response.status).toBe(401);
    }
  });

  test("rejects unknown and private fields before touching storage", async () => {
    for (const [path, body] of [
      ["/myths", { title: "x", ownerId: "uid-bob" }],
      ["/myths", { title: "x", visibility: "public" }],
      ["/myths", { title: "   " }],
      [`/myths/${id}/beats`, { label: "x", afterVersionBeatId: id }],
      [`/myths/${id}/beats`, { label: "x", note: "needs a version" }],
      [`/myths/${id}/beats`, { label: "x", wording: { language: "not a tag!", text: "x" } }],
      [`/versions/${id}/beats`, { beatId: id, position: 1, afterId: id }],
    ] as const) {
      const response = await handler(
        new Request(`http://api.test${path}`, {
          method: "POST",
          headers: { Authorization: "Bearer alice", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(400);
    }
  });
});

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("narrative API (Firestore emulator)", () => {
  const db = new Firestore({ projectId: "demo-disnostos", preferRest: true });
  const handler = createHandler(new Set(), verify, createDataLayer(db, blobs));

  const call = (user: string | null, method: string, path: string, body?: unknown) =>
    handler(
      new Request(`http://api.test${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${user}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  async function ok<T = any>(user: string, method: string, path: string, body?: unknown): Promise<T> {
    const response = await call(user, method, path, body);
    if (response.status >= 300) {
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }

  const status = async (user: string, method: string, path: string, body?: unknown) =>
    (await call(user, method, path, body)).status;

  const count = async (name: keyof typeof collections) =>
    (await db.collection(collections[name]).count().get()).data().count;

  async function revisions(name: "WordingRevision" | "VersionRevision", field: string, id: string) {
    const found = await db.collection(collections[name]).where(field, "==", id).get();
    return found.docs.map((doc) => doc.data()).sort((a, b) => a.number - b.number);
  }

  /** A myth with one version, ready to receive beats. */
  async function story(user = "alice") {
    const { myth, version } = await ok(user, "POST", "/myths", {
      title: "Antigone",
      version: { title: "Sophocles" },
    });
    return { mythId: myth.id as string, versionId: version.id as string };
  }

  const addBeat = (user: string, mythId: string, label: string, extra: object = {}) =>
    ok(user, "POST", `/myths/${mythId}/beats`, { label, ...extra });

  const order = async (versionId: string, user = "alice") =>
    (await ok(user, "GET", `/versions/${versionId}`)).beats.map((row: any) => row.beatId);

  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-disnostos/databases/(default)/documents`,
      { method: "DELETE" },
    );
  });

  test("CRUD for every top-level object, without exposing the owner", async () => {
    const { mythId, versionId } = await story();
    const { beat } = await addBeat("alice", mythId, "Return");
    const wording = await ok("alice", "POST", `/beats/${beat.id}/wordings`, { language: "en", text: "She returns" });
    const { tradition } = await ok("alice", "POST", "/traditions", { name: "Tragic" });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "Greek" });

    for (const [root, id, patch, field] of [
      ["myths", mythId, { title: "Antigone II" }, "title"],
      ["beats", beat.id, { label: "Homecoming" }, "label"],
      ["wordings", wording.id, { text: "She came home" }, "text"],
      ["versions", versionId, { title: "Anouilh" }, "title"],
      ["traditions", tradition.id, { name: "Chthonic" }, "name"],
      ["mythologies", mythology.id, { name: "Hellenic" }, "name"],
    ] as const) {
      const updated = await ok("alice", "PATCH", `/${root}/${id}`, patch);
      expect(updated[field]).toBe(Object.values(patch)[0]);
      expect(updated).not.toHaveProperty("ownerId");
      const read = await ok("alice", "GET", `/${root}/${id}`);
      expect(read[field]).toBe(Object.values(patch)[0]);
      expect(read).not.toHaveProperty("visibility");
    }

    expect((await ok("alice", "GET", `/beats?mythId=${mythId}`)).items).toHaveLength(1);
    expect((await ok("alice", "GET", `/wordings?beatId=${beat.id}`)).items).toHaveLength(1);
    expect((await ok("alice", "GET", `/versions?mythId=${mythId}`)).items).toHaveLength(1);
    expect(await status("alice", "GET", "/beats")).toBe(400);
    expect(await status("alice", "GET", "/wordings")).toBe(400);
    expect(await status("alice", "GET", `/versions?mythId=${mythId}&limit=1`)).toBe(400);

    expect(await status("alice", "DELETE", `/wordings/${wording.id}`)).toBe(204);
    expect(await status("alice", "DELETE", `/beats/${beat.id}`)).toBe(204);
    expect(await status("alice", "DELETE", `/versions/${versionId}`)).toBe(204);
    expect(await status("alice", "DELETE", `/traditions/${tradition.id}`)).toBe(204);
    expect(await status("alice", "DELETE", `/mythologies/${mythology.id}`)).toBe(204);
    expect(await status("alice", "DELETE", `/myths/${mythId}`)).toBe(204);
    expect(await status("alice", "GET", `/myths/${mythId}`)).toBe(404);
  });

  test("lists are newest first, paginated, and scoped to the owner", async () => {
    for (const title of ["a", "b", "c"]) {
      await ok("alice", "POST", "/myths", { title });
      await Bun.sleep(2);
    }
    await ok("bob", "POST", "/myths", { title: "other" });
    const first = await ok("alice", "GET", "/myths?limit=2");
    expect(first.items.map((item: any) => item.title)).toEqual(["c", "b"]);
    const second = await ok("alice", "GET", `/myths?limit=2&cursor=${first.nextCursor}`);
    expect(second.items.map((item: any) => item.title)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
    expect(await status("alice", "GET", "/myths?cursor=nope")).toBe(400);
  });

  test("another user's objects are 404, as targets and as references", async () => {
    const { mythId, versionId } = await story();
    const { beat, wording } = await addBeat("alice", mythId, "Return", {
      wording: { language: "en", text: "x" },
      versionId,
    });
    const { tradition } = await ok("alice", "POST", "/traditions", { name: "T" });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "M" });
    const bob = await story("bob");
    const bobBeat = (await addBeat("bob", bob.mythId, "Mine")).beat;
    const { tradition: bobTradition } = await ok("bob", "POST", "/traditions", { name: "B" });
    const bobMythology = await ok("bob", "POST", "/mythologies", { name: "B" });

    for (const [root, id] of [
      ["myths", mythId],
      ["beats", beat.id],
      ["wordings", wording.id],
      ["versions", versionId],
      ["traditions", tradition.id],
      ["mythologies", mythology.id],
    ]) {
      expect(await status("bob", "GET", `/${root}/${id}`)).toBe(404);
      expect(await status("bob", "PATCH", `/${root}/${id}`, { title: "x", label: "x", text: "x", name: "x" })).not.toBe(200);
      expect(await status("bob", "DELETE", `/${root}/${id}`)).toBe(404);
    }
    expect(await status("bob", "GET", `/myths/${mythId}/full`)).toBe(404);
    expect(await status("bob", "POST", `/myths/${mythId}/beats`, { label: "x" })).toBe(404);
    expect(await status("bob", "POST", `/myths/${mythId}/versions`, { title: "x" })).toBe(404);
    expect(await status("bob", "POST", `/beats/${beat.id}/wordings`, { language: "en", text: "x" })).toBe(404);
    expect(await status("bob", "POST", `/versions/${versionId}/beats`, { beatId: bobBeat.id })).toBe(404);
    // Bob's own objects cannot reference Alice's.
    expect(await status("bob", "POST", `/versions/${bob.versionId}/beats`, { beatId: beat.id })).toBe(404);
    expect(await status("bob", "POST", `/versions/${bob.versionId}/beats`, { beatId: bobBeat.id, wordingId: wording.id })).toBe(404);
    expect(await status("bob", "POST", `/myths/${bob.mythId}/beats`, { label: "x", versionId })).toBe(404);
    expect(await status("bob", "POST", `/myths/${bob.mythId}/versions`, { title: "x", traditionId: tradition.id })).toBe(404);
    expect(await status("bob", "POST", `/beats/${bobBeat.id}/wordings`, { language: "en", text: "x", translatedFromId: wording.id })).toBe(404);
    expect(await status("bob", "POST", `/traditions/${bobTradition.id}/versions`, { versionId })).toBe(404);
    expect(await status("bob", "POST", `/mythologies/${bobMythology.id}/traditions`, { traditionId: tradition.id })).toBe(404);
    expect(await status("bob", "POST", "/traditions", { name: "x", mythologyId: mythology.id })).toBe(404);
    expect(await status("bob", "POST", "/traditions", { name: "x", versionId })).toBe(404);
    expect((await ok("alice", "GET", `/myths/${mythId}`)).title).toBe("Antigone");
  });

  test("compound create makes the beat, wording, and placement together", async () => {
    const { mythId, versionId } = await story();
    const first = await addBeat("alice", mythId, "One", {
      wording: { language: "en", text: "First passage" },
      versionId,
    });
    expect(first.wording.beatId).toBe(first.beat.id);
    expect(first.versionBeat).toMatchObject({ beatId: first.beat.id, wordingId: first.wording.id, versionId });

    const third = await addBeat("alice", mythId, "Three", { versionId });
    expect(third.wording).toBeNull();
    const second = await addBeat("alice", mythId, "Two", {
      versionId,
      afterVersionBeatId: first.versionBeat.id,
      wording: { language: "it", text: "Secondo" },
      note: "Pivot",
    });
    expect(second.versionBeat.note).toBe("Pivot");
    const zero = await addBeat("alice", mythId, "Zero", { versionId, afterVersionBeatId: null });
    expect(await order(versionId)).toEqual([zero.beat.id, first.beat.id, second.beat.id, third.beat.id]);

    const plain = await addBeat("alice", mythId, "Pool only");
    expect(plain).toMatchObject({ wording: null, versionBeat: null });
    expect(await revisions("WordingRevision", "wordingId", first.wording.id)).toHaveLength(1);
    // One from the version's creation and one per placement.
    expect(await revisions("VersionRevision", "versionId", versionId)).toHaveLength(5);
  });

  test("a failed compound create writes nothing", async () => {
    const { mythId } = await story();
    const other = await story();
    const beatsBefore = await count("Beat");
    const wordingsBefore = await count("Wording");
    for (const body of [
      { label: "x", wording: { language: "en", text: "y" }, versionId: other.versionId },
      { label: "x", wording: { language: "en", text: "y" }, versionId: crypto.randomUUID() },
    ]) {
      expect(await status("alice", "POST", `/myths/${mythId}/beats`, body)).toBeGreaterThanOrEqual(400);
    }
    const { versionId } = await ok("alice", "POST", `/myths/${mythId}/versions`, { title: "V" }).then(
      ({ version }) => ({ versionId: version.id }),
    );
    expect(
      await status("alice", "POST", `/myths/${mythId}/beats`, {
        label: "x",
        wording: { language: "en", text: "y" },
        versionId,
        afterVersionBeatId: crypto.randomUUID(),
      }),
    ).toBe(400);
    expect(await count("Beat")).toBe(beatsBefore);
    expect(await count("Wording")).toBe(wordingsBefore);
    expect(await count("WordingRevision")).toBe(0);
    expect(await count("VersionBeat")).toBe(0);
  });

  test("creation can attach to a parent in one call", async () => {
    const mythology = await ok("alice", "POST", "/mythologies", { name: "Greek" });
    const { mythId, versionId } = await story();
    const made = await ok("alice", "POST", "/traditions", {
      name: "Tragic",
      mythologyId: mythology.id,
      versionId,
    });
    expect(made.mythologyTradition.mythologyId).toBe(mythology.id);
    expect(made.traditionVersion.versionId).toBe(versionId);

    const second = await ok("alice", "POST", "/versions", {
      mythId,
      title: "Anouilh",
      traditionId: made.tradition.id,
    });
    expect(second.traditionVersion.traditionId).toBe(made.tradition.id);
    expect((await ok("alice", "GET", `/traditions/${made.tradition.id}`)).versionIds.sort()).toEqual(
      [versionId, second.version.id].sort(),
    );
    expect((await ok("alice", "GET", `/mythologies/${mythology.id}`)).traditionIds).toEqual([made.tradition.id]);
  });

  test("version composition enforces the model's invariants", async () => {
    const { mythId, versionId } = await story();
    const other = await story();
    const a = await addBeat("alice", mythId, "A", { wording: { language: "en", text: "a" } });
    const b = await addBeat("alice", mythId, "B", { wording: { language: "en", text: "b" } });
    const foreign = await addBeat("alice", other.mythId, "Elsewhere");

    const path = `/versions/${versionId}/beats`;
    expect(await status("alice", "POST", path, { beatId: foreign.beat.id })).toBe(400);
    expect(await status("alice", "POST", path, { beatId: a.beat.id, wordingId: b.wording.id })).toBe(400);

    const rowA = await ok("alice", "POST", path, { beatId: a.beat.id, wordingId: a.wording.id, note: "open" });
    const rowB = await ok("alice", "POST", path, { beatId: b.beat.id });
    expect(await status("alice", "POST", path, { beatId: b.beat.id, position: rowA.position })).toBe(409);
    expect(await status("alice", "PATCH", `${path}/${rowB.id}`, { wordingId: a.wording.id })).toBe(400);
    expect(await status("alice", "PATCH", `${path}/${rowB.id}`, { afterId: rowB.id })).toBe(400);

    await ok("alice", "PATCH", `${path}/${rowB.id}`, { afterId: null });
    expect(await order(versionId)).toEqual([b.beat.id, a.beat.id]);
    await ok("alice", "PATCH", `${path}/${rowB.id}`, { afterId: rowA.id });
    expect(await order(versionId)).toEqual([a.beat.id, b.beat.id]);

    const before = (await revisions("VersionRevision", "versionId", versionId)).length;
    await ok("alice", "PATCH", `${path}/${rowB.id}`, { afterId: rowA.id });
    expect(await revisions("VersionRevision", "versionId", versionId)).toHaveLength(before);

    const chosen = await ok("alice", "PATCH", `${path}/${rowB.id}`, { wordingId: b.wording.id, note: "close" });
    expect(chosen).toMatchObject({ wordingId: b.wording.id, note: "close" });
    expect(await ok("alice", "PATCH", `${path}/${rowB.id}`, { wordingId: null })).toMatchObject({ wordingId: null });

    expect(await status("alice", "DELETE", `${path}/${rowA.id}`)).toBe(204);
    expect(await status("alice", "DELETE", `${path}/${rowA.id}`)).toBe(404);
    expect(await order(versionId)).toEqual([b.beat.id]);
    expect(await status("alice", "GET", `/beats/${a.beat.id}`)).toBe(200);
  });

  test("repeated midpoint moves rebalance and keep the order", async () => {
    const { mythId, versionId } = await story();
    const path = `/versions/${versionId}/beats`;
    const a = await addBeat("alice", mythId, "A", { versionId });
    const b = await addBeat("alice", mythId, "B", { versionId });
    const c = await addBeat("alice", mythId, "C", { versionId });
    for (let round = 0; round < 45; round += 1) {
      const moving = round % 2 === 0 ? c : b;
      await ok("alice", "PATCH", `${path}/${moving.versionBeat.id}`, { afterId: a.versionBeat.id });
    }
    const rows = (await ok("alice", "GET", path)).items;
    expect(rows.map((row: any) => row.beatId)).toEqual([a.beat.id, c.beat.id, b.beat.id]);
    expect(new Set(rows.map((row: any) => row.position)).size).toBe(3);
  });

  test("translations stay within the beat and cannot form a cycle", async () => {
    const { mythId } = await story();
    const one = await addBeat("alice", mythId, "One", { wording: { language: "en", text: "a" } });
    const two = await addBeat("alice", mythId, "Two", { wording: { language: "en", text: "b" } });
    expect(
      await status("alice", "POST", `/beats/${one.beat.id}/wordings`, {
        language: "it",
        text: "x",
        translatedFromId: two.wording.id,
      }),
    ).toBe(400);
    const italian = await ok("alice", "POST", `/beats/${one.beat.id}/wordings`, {
      language: "it",
      text: "x",
      translatedFromId: one.wording.id,
    });
    expect(await status("alice", "PATCH", `/wordings/${one.wording.id}`, { translatedFromId: italian.id })).toBe(400);
    expect(await status("alice", "PATCH", `/wordings/${one.wording.id}`, { translatedFromId: one.wording.id })).toBe(400);
    expect(await status("alice", "PATCH", `/wordings/${italian.id}`, { translatedFromId: two.wording.id })).toBe(400);
  });

  test("wording and version edits append revisions, and no-ops do not", async () => {
    const { mythId, versionId } = await story();
    const { wording } = await addBeat("alice", mythId, "One", { wording: { language: "en", text: "v1" } });
    await ok("alice", "PATCH", `/wordings/${wording.id}`, { text: "v2" });
    await ok("alice", "PATCH", `/wordings/${wording.id}`, { text: "v2" });
    await ok("alice", "PATCH", `/wordings/${wording.id}`, { language: "it" });
    const wordingLog = await revisions("WordingRevision", "wordingId", wording.id);
    expect(wordingLog.map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(wordingLog.map((entry) => entry.snapshot.text)).toEqual(["v1", "v2", "v2"]);
    expect(wordingLog[2]!.snapshot.language).toBe("it");

    await ok("alice", "PATCH", `/versions/${versionId}`, { title: "Renamed" });
    await ok("alice", "PATCH", `/versions/${versionId}`, { title: "Renamed" });
    const versionLog = await revisions("VersionRevision", "versionId", versionId);
    expect(versionLog.map((entry) => entry.number)).toEqual([1, 2]);
    expect(versionLog[1]!.snapshot).toMatchObject({ title: "Renamed", beats: [] });
  });

  test("concurrent edits keep unique positions and gapless revisions", async () => {
    const { mythId, versionId } = await story();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) => addBeat("alice", mythId, `Beat ${index}`, { versionId })),
    );
    const placed = results.filter((result) => result.status === "fulfilled").length;
    expect(placed).toBe(4);
    const rows = (await ok("alice", "GET", `/versions/${versionId}/beats`)).items;
    expect(rows).toHaveLength(placed);
    expect(new Set(rows.map((row: any) => row.position)).size).toBe(placed);
    const log = await revisions("VersionRevision", "versionId", versionId);
    expect(log.map((entry) => entry.number)).toEqual(Array.from({ length: placed + 1 }, (_, i) => i + 1));
  });

  test("concurrent membership requests make one row", async () => {
    const { versionId } = await story();
    const { tradition } = await ok("alice", "POST", "/traditions", { name: "T" });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "M" });
    const versions = await Promise.all(
      Array.from({ length: 3 }, () => status("alice", "POST", `/traditions/${tradition.id}/versions`, { versionId })),
    );
    expect(versions.filter((code) => code === 201)).toHaveLength(1);
    expect(versions.filter((code) => code === 409)).toHaveLength(2);
    expect(await count("TraditionVersion")).toBe(1);

    const body = { traditionId: tradition.id };
    expect(await status("alice", "POST", `/mythologies/${mythology.id}/traditions`, body)).toBe(201);
    expect(await status("alice", "POST", `/mythologies/${mythology.id}/traditions`, body)).toBe(409);

    expect(await status("alice", "DELETE", `/traditions/${tradition.id}/versions/${versionId}`)).toBe(204);
    expect(await status("alice", "DELETE", `/traditions/${tradition.id}/versions/${versionId}`)).toBe(404);
    expect(await status("alice", "DELETE", `/mythologies/${mythology.id}/traditions/${tradition.id}`)).toBe(204);
    expect(await count("TraditionVersion")).toBe(0);
    expect(await count("MythologyTradition")).toBe(0);
  });

  test("a beat used in a version cannot be deleted, and the 409 names the version", async () => {
    const { mythId, versionId } = await story();
    const { beat, wording, versionBeat } = await addBeat("alice", mythId, "One", {
      wording: { language: "en", text: "x" },
      versionId,
    });
    const refused = await call("alice", "DELETE", `/beats/${beat.id}`);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { details: unknown }).details).toEqual({
      versions: [{ id: versionId, title: "Sophocles" }],
      versionBeatIds: [versionBeat.id],
    });
    expect(await status("alice", "GET", `/wordings/${wording.id}`)).toBe(200);

    await ok("alice", "DELETE", `/versions/${versionId}/beats/${versionBeat.id}`);
    expect(await status("alice", "DELETE", `/beats/${beat.id}`)).toBe(204);
    expect(await count("Wording")).toBe(0);
    expect(await count("WordingRevision")).toBe(0);
  });

  test("deleting a wording clears its uses and logs those changes", async () => {
    const { mythId, versionId } = await story();
    const { beat, wording, versionBeat } = await addBeat("alice", mythId, "One", {
      wording: { language: "en", text: "x" },
      versionId,
    });
    const translation = await ok("alice", "POST", `/beats/${beat.id}/wordings`, {
      language: "it",
      text: "y",
      translatedFromId: wording.id,
    });
    const before = (await revisions("VersionRevision", "versionId", versionId)).length;

    expect(await status("alice", "DELETE", `/wordings/${wording.id}`)).toBe(204);
    const rows = (await ok("alice", "GET", `/versions/${versionId}/beats`)).items;
    expect(rows[0]).toMatchObject({ id: versionBeat.id, wordingId: null });
    expect((await ok("alice", "GET", `/wordings/${translation.id}`)).translatedFromId).toBeNull();

    const versionLog = await revisions("VersionRevision", "versionId", versionId);
    expect(versionLog).toHaveLength(before + 1);
    expect(versionLog.at(-1)!.snapshot.beats[0].wordingId).toBeNull();
    const translationLog = await revisions("WordingRevision", "wordingId", translation.id);
    expect(translationLog.map((entry) => entry.snapshot.translatedFromId)).toEqual([wording.id, null]);
  });

  test("cascades: a myth takes its content, and collections survive", async () => {
    const { mythId, versionId } = await story();
    await addBeat("alice", mythId, "One", { wording: { language: "en", text: "x" }, versionId });
    await addBeat("alice", mythId, "Two", { wording: { language: "en", text: "y" }, versionId });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "Greek" });
    const { tradition } = await ok("alice", "POST", "/traditions", {
      name: "Tragic",
      mythologyId: mythology.id,
      versionId,
    });

    expect(await status("alice", "DELETE", `/myths/${mythId}`)).toBe(204);
    for (const name of [
      "Myth",
      "Beat",
      "Wording",
      "WordingRevision",
      "Version",
      "VersionBeat",
      "VersionRevision",
      "TraditionVersion",
    ] as const) {
      expect(await count(name)).toBe(0);
    }
    expect(await status("alice", "GET", `/traditions/${tradition.id}`)).toBe(200);
    expect((await ok("alice", "GET", `/mythologies/${mythology.id}`)).traditionIds).toEqual([tradition.id]);
  });

  test("cascades: version, tradition, and mythology remove only their own links", async () => {
    const { mythId, versionId } = await story();
    const { beat } = await addBeat("alice", mythId, "One", { versionId });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "Greek" });
    const { tradition } = await ok("alice", "POST", "/traditions", {
      name: "Tragic",
      mythologyId: mythology.id,
      versionId,
    });

    expect(await status("alice", "DELETE", `/mythologies/${mythology.id}`)).toBe(204);
    expect(await count("MythologyTradition")).toBe(0);
    expect(await status("alice", "GET", `/traditions/${tradition.id}`)).toBe(200);

    expect(await status("alice", "DELETE", `/traditions/${tradition.id}`)).toBe(204);
    expect(await count("TraditionVersion")).toBe(0);
    expect(await status("alice", "GET", `/versions/${versionId}`)).toBe(200);

    expect(await status("alice", "DELETE", `/versions/${versionId}`)).toBe(204);
    expect(await count("VersionBeat")).toBe(0);
    expect(await count("VersionRevision")).toBe(0);
    expect(await status("alice", "GET", `/beats/${beat.id}`)).toBe(200);
  });

  describe("derivations and taggings outlive their targets", () => {
    type End = [target: "Myth" | "Version" | "Beat" | "Figure", id: string];

    const derivations = () =>
      db
        .collection(collections.Derivation)
        .withConverter(converters.Derivation as unknown as FirestoreDataConverter<Derivation>);

    async function link(ownerId: string, [fromTarget, fromId]: End, [toTarget, toId]: End) {
      const now = new Date();
      const row = {
        id: crypto.randomUUID(),
        ownerId,
        kind: "echoes",
        note: `secret-note-${crypto.randomUUID()}`,
        [`from${fromTarget}Id`]: fromId,
        [`to${toTarget}Id`]: toId,
        createdAt: now,
        updatedAt: now,
      } as unknown as Derivation;
      await derivations().doc(row.id).set(row);
      return (await derivations().doc(row.id).get()).data()!;
    }

    /** The row must be exactly what was stored, so nothing was cleared or rewritten. */
    const expectIntact = async (row: Derivation) =>
      expect((await derivations().doc(row.id).get()).data()).toEqual(row);

    async function seed(name: keyof typeof collections, ownerId: string, fields: object) {
      const id = crypto.randomUUID();
      const now = new Date();
      await db.collection(collections[name]).doc(id).set({ ownerId, ...fields, createdAt: now, updatedAt: now });
      return id;
    }

    const exists = async (name: keyof typeof collections, id: string) =>
      (await db.collection(collections[name]).doc(id).get()).exists;

    test("deleting either end directly keeps the row, for every end type", async () => {
      const anchor: End = ["Myth", (await story()).mythId];
      const makers: Record<End[0], () => Promise<{ id: string; remove: () => Promise<void> }>> = {
        Myth: async () => {
          const { mythId: id } = await story();
          return { id, remove: async () => void (await ok("alice", "DELETE", `/myths/${id}`)) };
        },
        Version: async () => {
          const { versionId: id } = await story();
          return { id, remove: async () => void (await ok("alice", "DELETE", `/versions/${id}`)) };
        },
        Beat: async () => {
          const { beat } = await addBeat("alice", (await story()).mythId, "Return");
          return { id: beat.id, remove: async () => void (await ok("alice", "DELETE", `/beats/${beat.id}`)) };
        },
        // Figures have no route yet, so this goes through the delete plan every route uses.
        Figure: async () => {
          const id = await seed("Figure", "uid-alice", { visibility: "private", kind: "character", name: "Kore" });
          return {
            id,
            remove: () =>
              db.runTransaction(async (tx) => {
                const plan = new DeletePlan(db, tx);
                await plan.remove("Figure", db.collection(collections.Figure).doc(id));
                plan.apply(new Date());
              }),
          };
        },
      };

      for (const target of ["Myth", "Version", "Beat", "Figure"] as const) {
        const { id, remove } = await makers[target]();
        const asFrom = await link("uid-alice", [target, id], anchor);
        const asTo = await link("uid-alice", anchor, [target, id]);
        await remove();
        expect(await exists(target, id)).toBe(false);
        await expectIntact(asFrom);
        await expectIntact(asTo);
      }
    });

    test("another user deleting the target cannot remove my derivation", async () => {
      const mine = await story();
      const theirs = await story("bob");
      const row = await link("uid-alice", ["Myth", mine.mythId], ["Myth", theirs.mythId]);

      expect(await status("bob", "DELETE", `/myths/${theirs.mythId}`)).toBe(204);
      expect(await exists("Myth", theirs.mythId)).toBe(false);
      await expectIntact(row);
    });

    test("a parent's cascade keeps derivations on the children it removes", async () => {
      const { mythId, versionId } = await story();
      const { beat } = await addBeat("alice", mythId, "Return", { versionId });
      const other = await story();
      const bob = await story("bob");
      const rows = [
        await link("uid-alice", ["Beat", beat.id], ["Myth", other.mythId]),
        await link("uid-alice", ["Myth", other.mythId], ["Version", versionId]),
        await link("uid-bob", ["Myth", bob.mythId], ["Beat", beat.id]),
      ];

      expect(await status("alice", "DELETE", `/myths/${mythId}`)).toBe(204);
      expect(await exists("Beat", beat.id)).toBe(false);
      expect(await exists("Version", versionId)).toBe(false);
      for (const row of rows) await expectIntact(row);
    });

    test("neighbouring cascades and cleared references still apply", async () => {
      const { mythId } = await story();
      const { beat } = await addBeat("alice", mythId, "Return");
      const untouched = (await addBeat("alice", mythId, "Other")).beat;
      const other = await story();
      const row = await link("uid-alice", ["Beat", beat.id], ["Myth", other.mythId]);

      const workId = await seed("Work", "uid-alice", { visibility: "private", kind: "poem", title: "Ode" });
      const tagId = await seed("Tag", "uid-alice", { name: "grief" });
      const citation = await seed("Citation", "uid-alice", { workId, targetBeatId: beat.id });
      const attachment = await seed("Attachment", "uid-alice", { workId, targetBeatId: beat.id });
      const tagging = await seed("Tagging", "uid-alice", { tagId, targetBeatId: beat.id });
      const interpretation = await seed("Interpretation", "uid-alice", { body: "x", targetBeatId: beat.id });
      const keptTagging = await seed("Tagging", "uid-alice", { tagId, targetBeatId: untouched.id });
      const fork = await seed("Beat", "uid-bob", { mythId: other.mythId, label: "Fork", forkedFromId: beat.id });

      expect(await status("alice", "DELETE", `/beats/${beat.id}`)).toBe(204);
      for (const [name, id] of [
        ["Citation", citation],
        ["Attachment", attachment],
        ["Interpretation", interpretation],
      ] as const) {
        expect(await exists(name, id)).toBe(false);
      }
      expect(await exists("Tagging", tagging)).toBe(true);
      expect(await exists("Tagging", keptTagging)).toBe(true);
      expect(await exists("Work", workId)).toBe(true);
      expect((await db.collection(collections.Beat).doc(fork).get()).data()!.forkedFromId).toBeNull();
      await expectIntact(row);

      const { mythId: shared } = await story();
      const share = await seed("Share", "uid-alice", { granteeId: "uid-bob", targetMythId: shared });
      expect(await status("alice", "DELETE", `/myths/${shared}`)).toBe(204);
      expect(await exists("Share", share)).toBe(false);
    });

    test("a surviving derivation appears in no response", async () => {
      const kept = await story();
      const gone = await story();
      const row = await link("uid-alice", ["Myth", kept.mythId], ["Myth", gone.mythId]);
      await ok("alice", "DELETE", `/myths/${gone.mythId}`);

      for (const user of ["alice", "bob"]) {
        for (const path of ["/myths", `/myths/${kept.mythId}`, `/myths/${kept.mythId}/full`, `/versions?mythId=${kept.mythId}`]) {
          const body = await (await call(user, "GET", path)).text();
          expect(body).not.toContain(row.id);
          expect(body).not.toContain(row.note!);
          expect(body).not.toContain(gone.mythId);
        }
      }
    });

    test("the owner's tombstone cannot tell another user's deleted object from a private one", async () => {
      const mine = await story();
      const deleted = await story("bob");
      const hidden = await story("bob");
      const toDeleted = await link("uid-alice", ["Myth", mine.mythId], ["Myth", deleted.mythId]);
      const toHidden = await link("uid-alice", ["Myth", mine.mythId], ["Myth", hidden.mythId]);
      await ok("bob", "DELETE", `/myths/${deleted.mythId}`);

      const project = async (viewer: string, row: Derivation, targetId: string) => {
        const read = async (id: string) =>
          (await db.collection(collections.Myth).doc(id).get()).data() as
            | { ownerId: string; visibility: string }
            | undefined;
        return projectDerivation(viewer, row, {
          from: endVisibleTo(viewer, await read(mine.mythId)),
          to: endVisibleTo(viewer, await read(targetId)),
        });
      };

      const stored = async (row: Derivation) => (await derivations().doc(row.id).get()).data()!;
      const a = await project("uid-alice", await stored(toDeleted), deleted.mythId);
      const b = await project("uid-alice", await stored(toHidden), hidden.mythId);
      if (a.state !== "tombstone" || b.state !== "tombstone") throw new Error("expected tombstones");
      const shape = ({ id: _id, note: _note, createdAt: _at, ...rest }: DerivationTombstone) => rest;
      expect(shape(a.derivation)).toEqual(shape(b.derivation));
      expect(a.derivation).toMatchObject({ kind: "echoes", note: toDeleted.note, toMythId: null });
      expect(JSON.stringify(a)).not.toContain(deleted.mythId);
      expect(JSON.stringify(b)).not.toContain(hidden.mythId);

      expect(await project("uid-bob", await stored(toDeleted), deleted.mythId)).toEqual({ state: "hidden" });
      expect(await project("uid-bob", await stored(toHidden), hidden.mythId)).toEqual({ state: "hidden" });
    });

    const removeWithPlan = (name: EntityName, id: string) =>
      db.runTransaction(async (tx) => {
        const plan = new DeletePlan(db, tx);
        await plan.remove(name, db.collection(collections[name]).doc(id));
        plan.apply(new Date());
      });

    const rawTagging = async (id: string) =>
      (await db.collection(collections.Tagging).doc(id).get()).data();

    test("a tagging survives deletion of every target type, unchanged", async () => {
      const tagId = await seed("Tag", "uid-alice", { name: "grief" });
      const targets = entities.find((entity) => entity.name === "Tagging")!.arcs!.target!.targets;
      expect(targets).toHaveLength(13);
      for (const target of targets) {
        const targetId = await seed(target, "uid-bob", {});
        const tagging = await seed("Tagging", "uid-alice", { tagId, [arcColumn("target", target)]: targetId });
        const before = await rawTagging(tagging);
        await removeWithPlan(target, targetId);
        expect(await exists(target, targetId)).toBe(false);
        expect(await rawTagging(tagging)).toEqual(before!);
      }
    });

    test("taggings survive a parent's cascade, including another user's", async () => {
      const { mythId, versionId } = await story();
      const { beat, wording } = await addBeat("alice", mythId, "Return", {
        versionId,
        wording: { language: "en", text: "x" },
      });
      const aliceTag = await seed("Tag", "uid-alice", { name: "mine" });
      const bobTag = await seed("Tag", "uid-bob", { name: "theirs" });
      const taggings = [
        await seed("Tagging", "uid-alice", { tagId: aliceTag, targetMythId: mythId }),
        await seed("Tagging", "uid-alice", { tagId: aliceTag, targetVersionId: versionId }),
        await seed("Tagging", "uid-alice", { tagId: aliceTag, targetBeatId: beat.id }),
        await seed("Tagging", "uid-bob", { tagId: bobTag, targetWordingId: wording.id }),
      ];

      expect(await status("alice", "DELETE", `/myths/${mythId}`)).toBe(204);
      expect(await exists("Wording", wording.id)).toBe(false);
      for (const tagging of taggings) expect(await exists("Tagging", tagging)).toBe(true);
    });

    test("deleting a tag still deletes its taggings, even with a deleted target", async () => {
      const { mythId } = await story();
      const { mythId: liveMyth } = await story();
      const tagId = await seed("Tag", "uid-alice", { name: "grief" });
      const otherTag = await seed("Tag", "uid-alice", { name: "joy" });
      const dangling = await seed("Tagging", "uid-alice", { tagId, targetMythId: mythId });
      const live = await seed("Tagging", "uid-alice", { tagId, targetMythId: liveMyth });
      const other = await seed("Tagging", "uid-alice", { tagId: otherTag, targetMythId: mythId });
      await ok("alice", "DELETE", `/myths/${mythId}`);

      await removeWithPlan("Tag", tagId);
      expect(await exists("Tagging", dangling)).toBe(false);
      expect(await exists("Tagging", live)).toBe(false);
      expect(await exists("Tagging", other)).toBe(true);
      expect(await status("alice", "GET", `/myths/${liveMyth}`)).toBe(200);
    });

    test("a kept tagging appears in no response", async () => {
      const kept = await story();
      const gone = await story();
      const tagId = await seed("Tag", "uid-alice", { name: "secret-tag-name" });
      const tagging = await seed("Tagging", "uid-alice", { tagId, targetMythId: gone.mythId });
      await ok("alice", "DELETE", `/myths/${gone.mythId}`);

      for (const user of ["alice", "bob"]) {
        for (const path of ["/myths", `/myths/${kept.mythId}`, `/myths/${kept.mythId}/full`, `/versions?mythId=${kept.mythId}`]) {
          const body = await (await call(user, "GET", path)).text();
          for (const secret of [tagging, tagId, "secret-tag-name", gone.mythId]) {
            expect(body).not.toContain(secret);
          }
        }
      }
    });
  });

  test("the full myth comes back in one response", async () => {
    const { mythId, versionId } = await story();
    const second = (await ok("alice", "POST", `/myths/${mythId}/versions`, { title: "Anouilh" })).version;
    const one = await addBeat("alice", mythId, "One", { wording: { language: "en", text: "x" }, versionId });
    const two = await addBeat("alice", mythId, "Two", {
      wording: { language: "en", text: "y" },
      versionId,
      afterVersionBeatId: null,
    });
    await ok("alice", "POST", `/beats/${one.beat.id}/wordings`, { language: "it", text: "z" });
    await ok("alice", "POST", `/versions/${second.id}/beats`, { beatId: one.beat.id });
    const mythology = await ok("alice", "POST", "/mythologies", { name: "Greek" });
    const { tradition } = await ok("alice", "POST", "/traditions", {
      name: "Tragic",
      mythologyId: mythology.id,
      versionId,
    });
    await addBeat("bob", (await story("bob")).mythId, "Bob's");

    const full = await ok("alice", "GET", `/myths/${mythId}/full`);
    expect(full.myth.id).toBe(mythId);
    expect(full.beats).toHaveLength(2);
    expect(full.beats.find((beat: any) => beat.id === one.beat.id).wordings).toHaveLength(2);

    const told = full.versions.find((version: any) => version.id === versionId);
    expect(told.beats.map((row: any) => row.beatId)).toEqual([two.beat.id, one.beat.id]);
    expect(told.traditionIds).toEqual([tradition.id]);
    expect(told.mythologyIds).toEqual([mythology.id]);
    expect(full.versions.find((version: any) => version.id === second.id)).toMatchObject({
      traditionIds: [],
      mythologyIds: [],
    });
    expect(full.traditions).toHaveLength(1);
    expect(full.traditions[0]).toMatchObject({ id: tradition.id, mythologyIds: [mythology.id] });
    expect(full.mythologies.map((row: any) => row.id)).toEqual([mythology.id]);
    expect(JSON.stringify(full)).not.toContain("ownerId");

    const empty = await ok("alice", "POST", "/myths", { title: "Empty" });
    expect(await ok("alice", "GET", `/myths/${empty.myth.id}/full`)).toMatchObject({
      beats: [],
      versions: [],
      traditions: [],
      mythologies: [],
    });
  });

  test("the full myth handles more rows than one Firestore `in` filter", async () => {
    const { mythId, versionId } = await story();
    for (let index = 0; index < 35; index += 1) {
      await addBeat("alice", mythId, `Beat ${index}`, {
        wording: { language: "en", text: `Text ${index}` },
        versionId,
      });
    }
    const full = await ok("alice", "GET", `/myths/${mythId}/full`);
    expect(full.beats).toHaveLength(35);
    expect(full.beats.every((beat: any) => beat.wordings.length === 1)).toBe(true);
    expect(full.versions[0].beats).toHaveLength(35);

    expect(await status("alice", "DELETE", `/myths/${mythId}`)).toBe(204);
    expect(await count("Wording")).toBe(0);
  });
});
