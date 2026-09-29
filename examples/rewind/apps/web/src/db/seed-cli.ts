// Thin entry point: connects to the configured database and seeds it.
// Kept out of seed.ts so seed.ts stays import-free of server-only / Next.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { parseEnv } from "../lib/parse-env";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isLocalDb, seed, SEED_USER_EMAIL, SEED_USER_PASSWORD } from "./seed";

loadEnvConfig(process.cwd());
const env = parseEnv(process.env);
const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

const local = isLocalDb(env.DATABASE_URL);
const password = local ? SEED_USER_PASSWORD : randomBytes(18).toString("base64url");
await seed(db, new Date(), password);
if (!local) {
  // Only applies to rows inserted now: existing users keep their password.
  writeFileSync(
    ".seed-credentials",
    `${SEED_USER_EMAIL} ${password}\n(all seeded accounts share this password)\n`,
    { mode: 0o600 },
  );
  console.log("Remote DB: random seed password written to .seed-credentials");
}
client.close();
