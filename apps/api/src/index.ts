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

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: parsePort(process.env.PORT),
  fetch: createHandler(parseAllowedOrigins(process.env.ALLOWED_ORIGINS)),
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
