import type { AuthUser } from "./auth";
import type { DataLayer } from "./data/traces";
import { DataError } from "./data/errors";
import { MAX_IMAGE_BYTES } from "./data/images";
import { json, noContent, readJson } from "./http";
import { dispatchNarrative, isNarrativePath } from "./narrativeRoutes";

/** Reads an upload, stopping as soon as it passes the limit. */
async function readUpload(request: Request): Promise<Uint8Array> {
  const tooLarge = () => new DataError(413, "Image is larger than 10 MB");
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_IMAGE_BYTES) throw tooLarge();
  if (!request.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** True for every path this module serves, so that all of them require auth. */
export const isDataPath = (pathname: string) =>
  pathname === "/traces" || pathname.startsWith("/traces/") || isNarrativePath(pathname);

async function dispatch(request: Request, user: AuthUser, data: DataLayer): Promise<Response> {
  const url = new URL(request.url);
  const { method } = request;
  const owner = user.uid;
  const parts = url.pathname.split("/").slice(2);
  const [traceId, resource, childId, extra] = parts;
  const query = url.searchParams;

  if (extra !== undefined) return json({ error: "Not Found" }, 404);

  if (traceId === undefined) {
    if (method === "GET") {
      return json(
        await data.listTraces(owner, {
          from: query.get("from"),
          to: query.get("to"),
          cursor: query.get("cursor"),
          limit: query.get("limit"),
        }),
      );
    }
    if (method === "POST") return json(await data.createTrace(owner, await readJson(request)), 201);
  } else if (resource === undefined) {
    if (method === "GET") return json(await data.getTrace(owner, traceId));
    if (method === "PATCH") return json(await data.updateTrace(owner, traceId, await readJson(request)));
    if (method === "DELETE") {
      await data.deleteTrace(owner, traceId);
      return noContent();
    }
  } else if (resource === "images") {
    if (childId === undefined && method === "POST") {
      const bytes = await readUpload(request);
      return json(await data.addImage(owner, traceId, bytes, query.get("filename")), 201);
    }
    if (childId !== undefined && method === "GET") {
      const image = await data.readImage(owner, traceId, childId);
      return new Response(image.bytes, {
        headers: {
          "Content-Type": image.mimeType,
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    if (childId !== undefined && method === "DELETE") {
      await data.deleteImage(owner, traceId, childId);
      return noContent();
    }
  } else if (resource === "links") {
    if (childId === undefined && method === "POST") {
      return json(await data.linkTraces(owner, traceId, await readJson(request)), 201);
    }
    if (childId !== undefined && method === "DELETE") {
      await data.unlinkTraces(owner, traceId, childId);
      return noContent();
    }
  }
  return json({ error: "Not Found" }, 404);
}

/** Runs an authenticated data request, translating failures to safe responses. */
export async function handleData(
  request: Request,
  user: AuthUser,
  data: DataLayer | null,
): Promise<Response> {
  if (!data) return json({ error: "Storage is not configured" }, 503);
  try {
    if (isNarrativePath(new URL(request.url).pathname)) {
      return await dispatchNarrative(request, user.uid, data.narrative);
    }
    return await dispatch(request, user, data);
  } catch (error) {
    if (error instanceof DataError) {
      return json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, error.status);
    }
    console.error("Request failed:", error instanceof Error ? error.name : "unknown error");
    return json({ error: "Internal Server Error" }, 500);
  }
}
