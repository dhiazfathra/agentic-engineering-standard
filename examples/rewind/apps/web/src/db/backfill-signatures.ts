// One-off: computes errorSignature for every existing rewind row that has
// none, from its own events. New rows get it at insert time
// (src/app/api/rewinds/route.ts); this only covers rows that predate that.
// Run once with `bun src/db/backfill-signatures.ts` (see docs/STACK.md).
import { loadEnvConfig } from "@next/env";
import { asc, eq, isNull } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { parseEnv } from "../lib/parse-env";
import { errorSignature } from "../lib/signature";

loadEnvConfig(process.cwd());
const env = parseEnv(process.env);
const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

export async function backfillSignatures(): Promise<number> {
  const rows = await db.query.rewinds.findMany({
    where: isNull(schema.rewinds.errorSignature),
    with: { events: { orderBy: asc(schema.events.t) } },
  });

  let updated = 0;
  for (const row of rows) {
    const signature = errorSignature(row.events);
    if (signature === null) continue;
    await db
      .update(schema.rewinds)
      .set({ errorSignature: signature })
      .where(eq(schema.rewinds.id, row.id));
    updated++;
  }
  return updated;
}

if (import.meta.main) {
  const updated = await backfillSignatures();
  console.log(`Backfilled ${updated} rewind(s).`);
  client.close();
}
