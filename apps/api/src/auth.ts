import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const SECURE_TOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const MAX_SUBJECT_LENGTH = 128;
const CLOCK_TOLERANCE_SECONDS = 5;

export type AuthUser = {
  /** Stable Identity Platform user ID. Use this as the owner ID. */
  uid: string;
  email: string | null;
};

/** Resolves to the token's user, and rejects for any token that is not valid. */
export type TokenVerifier = (token: string) => Promise<AuthUser>;

export type AuthedHandler = (request: Request, user: AuthUser) => Response | Promise<Response>;

/** Verifies Identity Platform ID tokens issued for one project. */
export function createTokenVerifier(
  projectId: string | undefined,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(SECURE_TOKEN_JWKS_URL)),
): TokenVerifier {
  if (!projectId) {
    console.error("AUTH_PROJECT_ID is not set: every authenticated request will be rejected");
    return () => Promise.reject(new Error("Auth is not configured"));
  }

  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
    });

    const { sub, auth_time: authTime, email } = payload;
    const now = Date.now() / 1000 + CLOCK_TOLERANCE_SECONDS;
    if (!sub || sub.length > MAX_SUBJECT_LENGTH) throw new Error("Invalid subject");
    if (typeof authTime !== "number" || authTime > now) throw new Error("Invalid auth_time");
    if (typeof payload.iat !== "number" || payload.iat > now) throw new Error("Invalid iat");

    return { uid: sub, email: typeof email === "string" ? email : null };
  };
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

const unauthorized = () =>
  Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );

/** Wraps a handler so it only runs for a verified user. Any failure is a 401. */
export function withAuth(verifyToken: TokenVerifier, handler: AuthedHandler) {
  return async (request: Request): Promise<Response> => {
    const token = bearerToken(request);
    if (token === null) return unauthorized();

    let user: AuthUser;
    try {
      user = await verifyToken(token);
    } catch {
      return unauthorized();
    }
    return handler(request, user);
  };
}
