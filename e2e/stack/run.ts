// Starts the hermetic stack, runs Playwright, and always tears the stack down.
// Usage: bun run e2e [--project=chromium|firefox] [other Playwright arguments]
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $, type Subprocess } from "bun";
import {
  API_URL,
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR_HOST,
  PROJECT_ID,
  STORAGE_EMULATOR_URL,
  WEB_URL,
} from "../support/env";

const E2E = join(import.meta.dir, "..");
const ROOT = join(E2E, "..");
const STACK = join(E2E, ".stack");
const WEB_DIST = join(STACK, "web");
const STARTUP_ATTEMPTS = 240;
const STARTUP_INTERVAL_MS = 500;

const IMAGES = {
  web: "nginxinc/nginx-unprivileged:1.27-alpine",
  firestore: "gcr.io/google.com/cloudsdktool/google-cloud-cli:594.0.0-emulators",
  storage: "fsouza/fake-gcs-server:1.56.1",
};
const CONTAINERS = ["disnostos-e2e-web", "disnostos-e2e-firestore", "disnostos-e2e-storage"];

const args = process.argv.slice(2);
const forbidden = args.find((arg) => /^--(timeout|global-timeout|retries)\b/.test(arg));
if (forbidden) {
  console.error(`${forbidden} is not allowed. See e2e/GUIDELINES.md.`);
  process.exit(2);
}

const children: Subprocess[] = [];
const removeContainers = () => $`docker rm -f ${CONTAINERS}`.quiet().nothrow();

let stopping: Promise<void> | undefined;
const stop = () =>
  (stopping ??= (async () => {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    await removeContainers();
  })());

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void stop().then(() => process.exit(130)));
}

function start(name: string, command: string[], env: Record<string, string> = {}) {
  const log = Bun.file(join(STACK, `${name}.log`));
  children.push(
    Bun.spawn(command, { cwd: E2E, env: { ...process.env, ...env }, stdout: log, stderr: log }),
  );
}

/** Harness start-up only. Tests themselves never wait. */
async function ready(name: string, url: string) {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    const up = await fetch(url).then(() => true, () => false);
    if (up) return;
    await Bun.sleep(STARTUP_INTERVAL_MS);
  }
  const log = Bun.file(join(STACK, `${name}.log`));
  if (await log.exists()) console.error(await log.text());
  throw new Error(`${name} did not start. See e2e/.stack/${name}.log`);
}

async function main(): Promise<number> {
  rmSync(STACK, { recursive: true, force: true });
  mkdirSync(STACK, { recursive: true });
  await removeContainers();

  // A separate output directory keeps the emulator setting out of any deployable build.
  await $`bun run --cwd ${join(ROOT, "apps/web")} vite build --outDir ${WEB_DIST} --emptyOutDir`
    .env({
      ...process.env,
      VITE_API_URL: API_URL,
      VITE_FIREBASE_API_KEY: "e2e",
      VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
      VITE_AUTH_EMULATOR_URL: AUTH_EMULATOR_URL,
    })
    .quiet();

  const nginxConfig = join(ROOT, "apps/web/nginx.conf");
  await $`docker run -d --name ${CONTAINERS[0]} -p 127.0.0.1:8088:8080 -v ${WEB_DIST}:/usr/share/nginx/html:ro -v ${nginxConfig}:/etc/nginx/conf.d/default.conf:ro ${IMAGES.web}`.quiet();
  await $`docker run -d --name ${CONTAINERS[1]} -p 127.0.0.1:8686:8686 ${IMAGES.firestore} gcloud emulators firestore start --host-port=0.0.0.0:8686`.quiet();
  await $`docker run -d --name ${CONTAINERS[2]} -p 127.0.0.1:4443:4443 ${IMAGES.storage} -scheme http -port 4443 -external-url ${STORAGE_EMULATOR_URL}`.quiet();
  start("auth", ["bun", "x", "firebase", "emulators:start", "--only", "auth", "--project", PROJECT_ID]);

  await ready("web", WEB_URL);
  await ready("firestore", `http://${FIRESTORE_EMULATOR_HOST}/`);
  await ready("storage", `${STORAGE_EMULATOR_URL}/storage/v1/b`);
  await ready("auth", AUTH_EMULATOR_URL);

  start("api", ["bun", "stack/api.ts"], {
    FIRESTORE_EMULATOR_HOST,
    STORAGE_EMULATOR_HOST: STORAGE_EMULATOR_URL,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  });
  await ready("api", `${API_URL}/health`);

  const tests = Bun.spawn(["bun", "x", "playwright", "test", ...args], {
    cwd: E2E,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return tests.exited;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(error);
} finally {
  await stop();
}
process.exit(code);
