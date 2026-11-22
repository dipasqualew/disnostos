import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./generated/drizzle.ts",
  out: "./migrations",
});
