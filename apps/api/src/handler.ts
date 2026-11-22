export const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173";

const ALLOWED_METHODS = "GET, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

export type RequestHandler = (request: Request) => Response;

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

function route(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/health") {
    return Response.json({ status: "ok" });
  }
  if (request.method === "GET" && pathname === "/hello") {
    return Response.json({ message: "Hello from disnostos" });
  }
  return Response.json({ error: "Not Found" }, { status: 404 });
}

export function createHandler(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (request) => {
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

    const response = route(request);
    headers.forEach((value, name) => response.headers.set(name, value));
    return response;
  };
}
