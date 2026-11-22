import { describe, expect, test } from "bun:test";
import { createHandler, parseAllowedOrigins } from "./handler";

const ALLOWED = "https://app.example.com";
const DISALLOWED = "https://evil.example.com";

const verifyToken = async (token: string) => {
  if (token !== "good") throw new Error("bad token");
  return { uid: "user-1", email: "user@example.com" };
};
const handler = createHandler(parseAllowedOrigins(`${ALLOWED}, http://localhost:5173`), verifyToken);

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://api.test${path}`, init);
}

function preflight(origin: string): Request {
  return request("/hello", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
  });
}

describe("routes", () => {
  test("GET /health returns ok", async () => {
    const response = await handler(request("/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /hello returns the greeting", async () => {
    const response = await handler(request("/hello"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello from disnostos" });
  });

  test("unknown path returns a JSON 404", async () => {
    const response = await handler(request("/nope"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not Found" });
  });

  test("wrong method on a known path returns 404", async () => {
    expect((await handler(request("/hello", { method: "POST" }))).status).toBe(404);
  });
});

describe("GET /me", () => {
  const me = (authorization?: string) =>
    handler(request("/me", authorization ? { headers: { Authorization: authorization } } : {}));

  test("returns the verified user", async () => {
    const response = await me("Bearer good");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uid: "user-1", email: "user@example.com" });
  });

  for (const header of [undefined, "Bearer bad", "Basic good", "Bearer", "Bearer good extra"]) {
    test(`rejects Authorization: ${header}`, async () => {
      const response = await me(header);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    });
  }
});

describe("CORS", () => {
  test("echoes an allowed origin", async () => {
    const response = await handler(request("/hello", { headers: { Origin: ALLOWED } }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("does not echo a disallowed origin", async () => {
    const response = await handler(request("/hello", { headers: { Origin: DISALLOWED } }));
    expect(response.status).toBe(200);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("handles preflight for an allowed origin", async () => {
    const response = await handler(preflight(ALLOWED));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PATCH, DELETE, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("grants nothing on preflight for a disallowed origin", async () => {
    const response = await handler(preflight(DISALLOWED));
    expect(response.status).toBe(204);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("ignores a wildcard in the allowlist", async () => {
    const wildcard = createHandler(parseAllowedOrigins("*"), verifyToken);
    const response = await wildcard(request("/hello", { headers: { Origin: "*" } }));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("defaults to the local web origin and treats empty as none", async () => {
    expect([...parseAllowedOrigins(undefined)]).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins("").size).toBe(0);
  });
});
