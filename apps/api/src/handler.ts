import { withAuth, type TokenVerifier } from "./auth";
import type { DataLayer } from "./data/traces";
import { handleData, isDataPath } from "./routes";

export const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173";

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

export type RequestHandler = (request: Request) => Promise<Response>;

/** Parses the allowlist, dropping blanks and any `*` so a wildcard can never be echoed. */
export function parseAllowedOrigins(
  value: string | undefined = DEFAULT_ALLOWED_ORIGINS,
): ReadonlySet<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== "" && origin !== "*"),
  );
}

function corsHeaders(request: Request, allowedOrigins: ReadonlySet<string>): Headers {
  const headers = new Headers({ Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin !== null && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function route(
  request: Request,
  verifyToken: TokenVerifier,
  data: DataLayer | null,
): Response | Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/health") {
    return Response.json({ status: "ok" });
  }
  if (request.method === "GET" && pathname === "/hello") {
    return Response.json({ message: "Hello from disnostos" });
  }
  if (request.method === "GET" && pathname === "/me") {
    return withAuth(verifyToken, (_request, user) => Response.json(user))(request);
  }
  if (isDataPath(pathname)) {
    return withAuth(verifyToken, (authed, user) => handleData(authed, user, data))(request);
  }
  return Response.json({ error: "Not Found" }, { status: 404 });
}

export function createHandler(
  allowedOrigins: ReadonlySet<string>,
  verifyToken: TokenVerifier,
  data: DataLayer | null = null,
): RequestHandler {
  return async (request) => {
    const headers = corsHeaders(request, allowedOrigins);

    const isPreflight =
      request.method === "OPTIONS" &&
      request.headers.has("Origin") &&
      request.headers.has("Access-Control-Request-Method");

    if (isPreflight) {
      if (headers.has("Access-Control-Allow-Origin")) {
        headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
        headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        headers.set("Access-Control-Max-Age", PREFLIGHT_MAX_AGE_SECONDS);
      }
      return new Response(null, { status: 204, headers });
    }

    const response = await route(request, verifyToken, data);
    headers.forEach((value, name) => response.headers.set(name, value));
    return response;
  };
}
