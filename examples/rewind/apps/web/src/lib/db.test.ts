import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "./db";

it("runs a query against the configured libSQL database", async () => {
  const rows = await db.all<{ one: number }>(sql`select 1 as one`);
  expect(rows).toEqual([{ one: 1 }]);
});
