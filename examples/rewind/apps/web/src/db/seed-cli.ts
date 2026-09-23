// Thin entry point: connects to the configured database and seeds it.
// Kept out of seed.ts so seed.ts stays import-free of server-only / Next.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { parseEnv } from "../lib/parse-env";
import { seed } from "./seed";

loadEnvConfig(process.cwd());
const env = parseEnv(process.env);
const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

await seed(db, new Date());
client.close();
