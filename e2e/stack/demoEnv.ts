/** Fixed local addresses of the demo stack, clear of the E2E stack's ports. */
export const DEMO = {
  webPort: 8188,
  apiPort: 3200,
  authPort: 9199,
  firestorePort: 8786,
  storagePort: 4543,
  hubPort: 4410,
  loggingPort: 4510,
} as const;

export const PROJECT_ID = "demo-disnostos";
export const WEB_URL = `http://127.0.0.1:${DEMO.webPort}`;
export const API_URL = `http://127.0.0.1:${DEMO.apiPort}`;
export const AUTH_EMULATOR_URL = `http://127.0.0.1:${DEMO.authPort}`;
export const FIRESTORE_EMULATOR_HOST = `127.0.0.1:${DEMO.firestorePort}`;
export const STORAGE_EMULATOR_URL = `http://127.0.0.1:${DEMO.storagePort}`;
export const IMAGES_BUCKET = "demo-images";

/** A local-only login that exists solely in the demo's Auth emulator. */
export const DEMO_ACCOUNT = { email: "demo@disnostos.test", password: "persephone" } as const;
