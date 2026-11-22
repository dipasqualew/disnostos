// The real API handler and data layer, on the demo stack's addresses. Mirrors stack/api.ts,
// which stays bound to the E2E addresses. Never imported by apps/api.
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { PassThroughClient } from "google-auth-library";
import type { TokenVerifier } from "../../apps/api/src/auth";
import { gcsBlobStore } from "../../apps/api/src/data/blobs";
import { MAX_IMAGE_BYTES } from "../../apps/api/src/data/images";
import { createDataLayer } from "../../apps/api/src/data/traces";
import { createHandler } from "../../apps/api/src/handler";
import { API_URL, AUTH_EMULATOR_URL, IMAGES_BUCKET, PROJECT_ID, STORAGE_EMULATOR_URL, WEB_URL } from "./demoEnv";

const verifyToken: TokenVerifier = async (idToken) => {
  const response = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=e2e`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) },
  );
  if (!response.ok) throw new Error("Invalid token");
  const { users } = (await response.json()) as { users: { localId: string; email?: string }[] };
  const user = users[0];
  if (!user) throw new Error("Unknown user");
  return { uid: user.localId, email: user.email ?? null };
};

const storage = new Storage({
  projectId: PROJECT_ID,
  apiEndpoint: STORAGE_EMULATOR_URL,
  authClient: new PassThroughClient(),
});
await storage.createBucket(IMAGES_BUCKET);

const { hostname, port } = new URL(API_URL);
Bun.serve({
  hostname,
  port: Number(port),
  maxRequestBodySize: MAX_IMAGE_BYTES + 1024 * 1024,
  fetch: createHandler(
    new Set([WEB_URL]),
    verifyToken,
    createDataLayer(
      new Firestore({ projectId: PROJECT_ID, preferRest: true, authClient: new PassThroughClient() }),
      gcsBlobStore(storage, IMAGES_BUCKET),
    ),
  ),
});
