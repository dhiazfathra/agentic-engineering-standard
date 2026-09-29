import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const dbFile = join(mkdtempSync(join(tmpdir(), "rewind-rl-")), "test.db");
const client = createClient({ url: `file:${dbFile}` });
const db = drizzle(client, { schema });
vi.mock("@/lib/db", () => ({ get db() { return db; } }));

import { clientIp, rateLimit, WINDOW_MS } from "./rate-limit";


beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
afterAll(() => client.close());

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to unknown", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  const rule = { key: "t:a", limit: 2 };

  it("allows up to the limit then 429s with Retry-After", async () => {
    const t = 1_000_000;
    expect(await rateLimit([rule], t)).toBeNull();
    expect(await rateLimit([rule], t + 1000)).toBeNull();
    const res = await rateLimit([rule], t + 2000);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe(String((WINDOW_MS - 2000) / 1000));
  });

  it("resets once the window has passed", async () => {
    const t = 5_000_000;
    await rateLimit([rule], t);
    await rateLimit([rule], t);
    expect((await rateLimit([rule], t))?.status).toBe(429);
    expect(await rateLimit([rule], t + WINDOW_MS)).toBeNull();
  });

  it("keeps separate keys independent and checks every rule", async () => {
    const t = 9_000_000;
    const rules = [
      { key: "t:x", limit: 1 },
      { key: "t:y", limit: 5 },
    ];
    expect(await rateLimit(rules, t)).toBeNull();
    expect((await rateLimit(rules, t))?.status).toBe(429);
    expect(await rateLimit([{ key: "t:z", limit: 1 }], t)).toBeNull();
  });
});
