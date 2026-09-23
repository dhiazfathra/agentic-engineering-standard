import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { parseEnv } from "./src/lib/parse-env";

// Same .env files, in the same order, as next dev and next build.
loadEnvConfig(process.cwd());
const env = parseEnv(process.env);

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN },
});
