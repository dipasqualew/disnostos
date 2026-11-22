// Starts a local demo stack, seeded from @disnostos/fixtures, and leaves it running.
// Usage: bun run demo          (re)start with fresh data
//        bun run demo:stop     stop it
// Only touches disnostos-demo-* containers and processes recorded in e2e/.demo/pids.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { createHttpClient, loadFixture, MYTH, persephone, VERSION } from "@disnostos/fixtures";
import { $ } from "bun";
import {
  API_URL,
  AUTH_EMULATOR_URL,
  DEMO,
  DEMO_ACCOUNT,
  FIRESTORE_EMULATOR_HOST,
  PROJECT_ID,
  STORAGE_EMULATOR_URL,
  WEB_URL,
} from "./demoEnv";

const E2E = join(import.meta.dir, "..");
const ROOT = join(E2E, "..");
const STATE = join(E2E, ".demo");
const WEB_DIST = join(STATE, "web");
const PIDS = join(STATE, "pids.json");
const STARTUP_ATTEMPTS = 240;
const STARTUP_INTERVAL_MS = 500;
const STOP_ATTEMPTS = 40;
const STOP_INTERVAL_MS = 250;

const IMAGES = {
  web: "nginxinc/nginx-unprivileged:1.27-alpine",
  firestore: "gcr.io/google.com/cloudsdktool/google-cloud-cli:594.0.0-emulators",
  storage: "fsouza/fake-gcs-server:1.56.1",
};
const CONTAINERS = { web: "disnostos-demo-web", firestore: "disnostos-demo-firestore", storage: "disnostos-demo-storage" };
const LABEL = "disnostos.stack=demo";

type Recorded = { name: string; pid: number; marker: string };

const commandOf = async (pid: number) =>
  (await $`ps -o command= -p ${pid}`.quiet().nothrow().text()).trim();

/** Stops only what this script started: a recorded PID whose command still matches. */
async function stopProcesses() {
  if (!existsSync(PIDS)) return;
  const recorded = JSON.parse(readFileSync(PIDS, "utf8")) as Recorded[];
  for (const { pid, marker } of recorded) {
    if (!(await commandOf(pid)).includes(marker)) continue;
    // Each process leads its own group, so this also reaches the emulator's Java child.
    process.kill(-pid, "SIGTERM");
    for (let attempt = 0; attempt < STOP_ATTEMPTS && (await commandOf(pid)); attempt += 1) {
      await Bun.sleep(STOP_INTERVAL_MS);
    }
    if ((await commandOf(pid)).includes(marker)) process.kill(-pid, "SIGKILL");
  }
  rmSync(PIDS);
}

async function removeContainers() {
  const ids = (await $`docker ps -aq --filter label=${LABEL}`.quiet().text()).split("\n").filter(Boolean);
  if (ids.length) await $`docker rm -f ${ids}`.quiet();
}

const portInUse = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

function startDetached(name: string, marker: string, command: string[], env: Record<string, string> = {}): Recorded {
  const log = openSync(join(STATE, `${name}.log`), "w");
  const child = spawn(command[0]!, command.slice(1), {
    cwd: E2E,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  if (child.pid === undefined) throw new Error(`Could not start ${name}`);
  return { name, pid: child.pid, marker };
}

async function ready(name: string, url: string) {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    if (await fetch(url).then(() => true, () => false)) return;
    await Bun.sleep(STARTUP_INTERVAL_MS);
  }
  throw new Error(`${name} did not start. See e2e/.demo/${name}.log`);
}

async function signInDemoAccount(): Promise<string> {
  const created = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify(DEMO_ACCOUNT),
    },
  );
  if (!created.ok) throw new Error(`Could not create the demo account: ${created.status}`);
  const response = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...DEMO_ACCOUNT, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Could not sign in the demo account: ${response.status}`);
  return ((await response.json()) as { idToken: string }).idToken;
}

async function stop() {
  await stopProcesses();
  await removeContainers();
}

async function start() {
  await stop();
  for (const port of Object.values(DEMO)) {
    if (await portInUse(port)) {
      throw new Error(`Port ${port} is in use by something this demo did not start. Nothing was stopped.`);
    }
  }
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(WEB_DIST, { recursive: true });

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
  await $`docker run -d --label ${LABEL} --name ${CONTAINERS.web} -p 127.0.0.1:${DEMO.webPort}:8080 -v ${WEB_DIST}:/usr/share/nginx/html:ro -v ${nginxConfig}:/etc/nginx/conf.d/default.conf:ro ${IMAGES.web}`.quiet();
  await $`docker run -d --label ${LABEL} --name ${CONTAINERS.firestore} -p 127.0.0.1:${DEMO.firestorePort}:8686 ${IMAGES.firestore} gcloud emulators firestore start --host-port=0.0.0.0:8686`.quiet();
  await $`docker run -d --label ${LABEL} --name ${CONTAINERS.storage} -p 127.0.0.1:${DEMO.storagePort}:4443 ${IMAGES.storage} -scheme http -port 4443 -external-url ${STORAGE_EMULATOR_URL}`.quiet();

  const firebaseConfig = join(STATE, "firebase.json");
  writeFileSync(
    firebaseConfig,
    JSON.stringify({
      emulators: {
        auth: { host: "127.0.0.1", port: DEMO.authPort },
        hub: { host: "127.0.0.1", port: DEMO.hubPort },
        logging: { host: "127.0.0.1", port: DEMO.loggingPort },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    }),
  );

  const recorded: Recorded[] = [];
  const record = (entry: Recorded) => {
    recorded.push(entry);
    writeFileSync(PIDS, JSON.stringify(recorded));
  };
  record(
    startDetached("auth", "firebase", [
      "bun", "x", "firebase", "emulators:start", "--only", "auth", "--project", PROJECT_ID, "--config", firebaseConfig,
    ]),
  );

  await ready("web", WEB_URL);
  await ready("firestore", `http://${FIRESTORE_EMULATOR_HOST}/`);
  await ready("storage", `${STORAGE_EMULATOR_URL}/storage/v1/b`);
  await ready("auth", AUTH_EMULATOR_URL);

  record(
    startDetached("api", "demoApi", ["bun", "stack/demoApi.ts"], {
      FIRESTORE_EMULATOR_HOST,
      STORAGE_EMULATOR_HOST: STORAGE_EMULATOR_URL,
      GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    }),
  );
  await ready("api", `${API_URL}/health`);

  const token = await signInDemoAccount();
  const loaded = await loadFixture(createHttpClient({ baseUrl: API_URL, token }), persephone);

  const myth = `${WEB_URL}/myths/${loaded.id(MYTH.persephone)}`;
  const homeric = loaded.id(VERSION.homeric);
  const ovid = loaded.id(VERSION.ovid);
  const summary = {
    read: `${myth}?version=${homeric}`,
    compare: `${myth}?version=${homeric}&compare=${ovid}`,
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
    ids: Object.fromEntries(loaded.ids),
  };
  writeFileSync(join(STATE, "demo.json"), JSON.stringify(summary, null, 2));
  console.log(`Demo is running.

  Read:     ${summary.read}
  Compare:  ${summary.compare}
  Login:    ${summary.email} / ${summary.password}

  Stop:     bun run demo:stop
  Restart:  bun run demo (resets the demo data, so the links above change)
  IDs:      e2e/.demo/demo.json`);
}

try {
  if (process.argv[2] === "stop") {
    await stop();
    console.log("Demo stopped.");
  } else {
    await start();
  }
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
