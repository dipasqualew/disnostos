import { describe, expect, test } from "bun:test";
import { createHandler, parseAllowedOrigins } from "./handler";

const ALLOWED = "https://app.example.com";
const DISALLOWED = "https://evil.example.com";

const handler = createHandler(parseAllowedOrigins(`${ALLOWED}, http://localhost:5173`));

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
    const response = handler(request("/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /hello returns the greeting", async () => {
    const response = handler(request("/hello"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello from disnostos" });
  });

  test("unknown path returns a JSON 404", async () => {
    const response = handler(request("/nope"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not Found" });
  });

  test("wrong method on a known path returns 404", () => {
    expect(handler(request("/hello", { method: "POST" })).status).toBe(404);
  });
});

describe("CORS", () => {
  test("echoes an allowed origin", () => {
    const response = handler(request("/hello", { headers: { Origin: ALLOWED } }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("does not echo a disallowed origin", () => {
    const response = handler(request("/hello", { headers: { Origin: DISALLOWED } }));
    expect(response.status).toBe(200);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("handles preflight for an allowed origin", () => {
    const response = handler(preflight(ALLOWED));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("grants nothing on preflight for a disallowed origin", () => {
    const response = handler(preflight(DISALLOWED));
    expect(response.status).toBe(204);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("ignores a wildcard in the allowlist", () => {
    const wildcard = createHandler(parseAllowedOrigins("*"));
    const response = wildcard(request("/hello", { headers: { Origin: "*" } }));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  test("defaults to the local web origin and treats empty as none", () => {
    expect([...parseAllowedOrigins(undefined)]).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins("").size).toBe(0);
  });
});
