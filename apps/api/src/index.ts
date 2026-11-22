import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { createTokenVerifier } from "./auth";
import { gcsBlobStore } from "./data/blobs";
import { MAX_IMAGE_BYTES } from "./data/images";
import { createDataLayer, type DataLayer } from "./data/traces";
import { createHandler, parseAllowedOrigins } from "./handler";

const DEFAULT_PORT = 3000;

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function createData(): DataLayer | null {
  const projectId = process.env.GCP_PROJECT_ID;
  const bucket = process.env.IMAGES_BUCKET;
  if (!projectId || !bucket) {
    console.error("GCP_PROJECT_ID or IMAGES_BUCKET is not set: trace routes will return 503");
    return null;
  }
  return createDataLayer(
    new Firestore({ projectId, preferRest: true }),
    gcsBlobStore(new Storage({ projectId }), bucket),
  );
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: parsePort(process.env.PORT),
  // Leaves room for headers; routes enforce the exact image limit.
  maxRequestBodySize: MAX_IMAGE_BYTES + 1024 * 1024,
  fetch: createHandler(
    parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    createTokenVerifier(process.env.AUTH_PROJECT_ID),
    createData(),
  ),
});

console.log(`API listening on http://${server.hostname}:${server.port}`);

let stopping = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}, stopping gracefully`);
  await server.stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
