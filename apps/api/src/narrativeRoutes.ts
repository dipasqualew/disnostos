import { invalid } from "./data/errors";
import type { NarrativeLayer } from "./data/narrative";
import { json, noContent, readJson } from "./http";

const ROOTS = ["myths", "beats", "wordings", "versions", "traditions", "mythologies"];

/** True for every narrative path, so that all of them require auth. */
export const isNarrativePath = (pathname: string) =>
  ROOTS.some((root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`));

const notFound = () => json({ error: "Not Found" }, 404);

type Crud = {
  list(): Promise<unknown>;
  create(body: unknown): Promise<unknown>;
  get(id: string): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>;
  remove(id: string): Promise<void>;
};

async function crud(request: Request, id: string | undefined, api: Crud): Promise<Response> {
  const { method } = request;
  if (id === undefined) {
    if (method === "GET") return json(await api.list());
    if (method === "POST") return json(await api.create(await readJson(request)), 201);
    return notFound();
  }
  if (method === "GET") return json(await api.get(id));
  if (method === "PATCH") return json(await api.update(id, await readJson(request)));
  if (method === "DELETE") {
    await api.remove(id);
    return noContent();
  }
  return notFound();
}

function requiredQuery(query: URLSearchParams, name: string): string {
  const value = query.get(name);
  if (!value) throw invalid(`${name} is required`);
  return value;
}

/** Top-level creates name their parent in the body and share the nested path's rules. */
const createUnder =
  (field: string, create: (parentId: string, input: unknown) => Promise<unknown>) =>
  async (input: unknown) => {
    const { [field]: parent, ...rest } =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    if (typeof parent !== "string") throw invalid(`${field} is required`);
    return create(parent, rest);
  };

async function nested(
  request: Request,
  owner: string,
  data: NarrativeLayer,
  path: string,
  id: string,
  childId: string | undefined,
): Promise<Response> {
  const { method } = request;
  const body = () => readJson(request);
  const created = async (value: Promise<unknown>) => json(await value, 201);
  const removed = async (value: Promise<void>) => {
    await value;
    return noContent();
  };

  if (childId === undefined) {
    if (path === "myths/full" && method === "GET") return json(await data.getMythFull(owner, id));
    if (path === "myths/beats") {
      if (method === "GET") return json(await data.listBeats(owner, id));
      if (method === "POST") return created(data.createBeat(owner, id, await body()));
    }
    if (path === "myths/versions") {
      if (method === "GET") return json(await data.listVersionsOfMyth(owner, id));
      if (method === "POST") return created(data.createVersion(owner, id, await body()));
    }
    if (path === "beats/wordings") {
      if (method === "GET") return json(await data.listWordings(owner, id));
      if (method === "POST") return created(data.createWording(owner, id, await body()));
    }
    if (path === "versions/beats") {
      if (method === "GET") return json(await data.listVersionBeats(owner, id));
      if (method === "POST") return created(data.addVersionBeat(owner, id, await body()));
    }
    if (path === "traditions/versions" && method === "POST") {
      return created(data.addVersionToTradition(owner, id, await body()));
    }
    if (path === "mythologies/traditions" && method === "POST") {
      return created(data.addTraditionToMythology(owner, id, await body()));
    }
    return notFound();
  }

  if (path === "versions/beats") {
    if (method === "PATCH") return json(await data.updateVersionBeat(owner, id, childId, await body()));
    if (method === "DELETE") return removed(data.removeVersionBeat(owner, id, childId));
  }
  if (path === "traditions/versions" && method === "DELETE") {
    return removed(data.removeVersionFromTradition(owner, id, childId));
  }
  if (path === "mythologies/traditions" && method === "DELETE") {
    return removed(data.removeTraditionFromMythology(owner, id, childId));
  }
  return notFound();
}

export async function dispatchNarrative(
  request: Request,
  owner: string,
  data: NarrativeLayer,
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams;
  const [root, id, resource, childId, extra] = url.pathname.split("/").slice(1);
  if (extra !== undefined || id === "" || resource === "" || childId === "") return notFound();
  if (resource !== undefined) {
    return nested(request, owner, data, `${root}/${resource}`, id!, childId);
  }
  const page = { cursor: query.get("cursor"), limit: query.get("limit") };

  switch (root) {
    case "myths":
      return crud(request, id, {
        list: () => data.listMyths(owner, page),
        create: (input) => data.createMyth(owner, input),
        get: (target) => data.getMyth(owner, target),
        update: (target, input) => data.updateMyth(owner, target, input),
        remove: (target) => data.deleteMyth(owner, target),
      });
    case "beats":
      return crud(request, id, {
        list: async () => data.listBeats(owner, requiredQuery(query, "mythId")),
        create: createUnder("mythId", (parent, input) => data.createBeat(owner, parent, input)),
        get: (target) => data.getBeat(owner, target),
        update: (target, input) => data.updateBeat(owner, target, input),
        remove: (target) => data.deleteBeat(owner, target),
      });
    case "wordings":
      return crud(request, id, {
        list: async () => data.listWordings(owner, requiredQuery(query, "beatId")),
        create: createUnder("beatId", (parent, input) => data.createWording(owner, parent, input)),
        get: (target) => data.getWording(owner, target),
        update: (target, input) => data.updateWording(owner, target, input),
        remove: (target) => data.deleteWording(owner, target),
      });
    case "versions":
      return crud(request, id, {
        list: () => data.listVersions(owner, { ...page, mythId: query.get("mythId") }),
        create: createUnder("mythId", (parent, input) => data.createVersion(owner, parent, input)),
        get: (target) => data.getVersion(owner, target),
        update: (target, input) => data.updateVersion(owner, target, input),
        remove: (target) => data.deleteVersion(owner, target),
      });
    case "traditions":
      return crud(request, id, {
        list: () => data.listTraditions(owner, page),
        create: (input) => data.createTradition(owner, input),
        get: (target) => data.getTradition(owner, target),
        update: (target, input) => data.updateTradition(owner, target, input),
        remove: (target) => data.deleteTradition(owner, target),
      });
    case "mythologies":
      return crud(request, id, {
        list: () => data.listMythologies(owner, page),
        create: (input) => data.createMythology(owner, input),
        get: (target) => data.getMythology(owner, target),
        update: (target, input) => data.updateMythology(owner, target, input),
        remove: (target) => data.deleteMythology(owner, target),
      });
    default:
      return notFound();
  }
}
