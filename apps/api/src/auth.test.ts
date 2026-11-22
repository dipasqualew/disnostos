import { beforeAll, describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { createTokenVerifier, type TokenVerifier } from "./auth";

const PROJECT = "test-project";
const ISSUER = `https://securetoken.google.com/${PROJECT}`;
const now = () => Math.floor(Date.now() / 1000);

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let keys: JWTVerifyGetKey;
let verify: TokenVerifier;

type Overrides = {
  key?: CryptoKey;
  issuer?: string;
  audience?: string;
  subject?: string;
  exp?: number;
  iat?: number;
  authTime?: number | null;
};

function sign({ key, issuer, audience, subject, exp, iat, authTime }: Overrides = {}) {
  const claims = authTime === null ? {} : { auth_time: authTime ?? now() - 60 };
  const jwt = new SignJWT({ ...claims, email: "user@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(issuer ?? ISSUER)
    .setAudience(audience ?? PROJECT)
    .setIssuedAt(iat ?? now() - 60)
    .setExpirationTime(exp ?? now() + 3600);
  if (subject !== "") jwt.setSubject(subject ?? "user-1");
  return jwt.sign(key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
  verify = createTokenVerifier(PROJECT, keys);
});

describe("createTokenVerifier", () => {
  test("accepts a valid token", async () => {
    expect(await verify(await sign())).toEqual({ uid: "user-1", email: "user@example.com" });
  });

  const rejected: [string, () => Overrides][] = [
    ["a wrong signature", () => ({ key: otherKey })],
    ["a wrong issuer", () => ({ issuer: "https://securetoken.google.com/other" })],
    ["a wrong audience", () => ({ audience: "other" })],
    ["an expired token", () => ({ exp: now() - 60 })],
    ["an empty subject", () => ({ subject: "" })],
    ["an oversized subject", () => ({ subject: "x".repeat(129) })],
    ["a missing auth_time", () => ({ authTime: null })],
    ["a future auth_time", () => ({ authTime: now() + 600 })],
    ["a future iat", () => ({ iat: now() + 600 })],
  ];
  for (const [name, overrides] of rejected) {
    test(`rejects ${name}`, async () => {
      await expect(verify(await sign(overrides()))).rejects.toThrow();
    });
  }

  test("rejects an unsigned token", async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "none" })}.${encode({ sub: "user-1", aud: PROJECT, iss: ISSUER })}.`;
    await expect(verify(token)).rejects.toThrow();
  });

  test("rejects everything when no project is configured", async () => {
    await expect(createTokenVerifier(undefined, keys)(await sign())).rejects.toThrow();
  });
});
