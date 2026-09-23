import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({ db: vi.fn(), s3: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { run: probes.db } }));
vi.mock("@/lib/storage", () => ({ s3: { send: probes.s3 } }));

import { GET } from "./route";

const ok = () => Promise.resolve();
const down = () => Promise.reject(new Error("ECONNREFUSED"));

describe("GET /api/health", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    [ok, ok, 200, { database: "ok", storage: "ok" }],
    [ok, down, 503, { database: "ok", storage: "unreachable" }],
    [down, ok, 503, { database: "unreachable", storage: "ok" }],
    [down, down, 503, { database: "unreachable", storage: "unreachable" }],
  ])("db %o, storage %o -> %i", async (db, s3, status, body) => {
    probes.db.mockImplementation(db);
    probes.s3.mockImplementation(s3);
    const res = await GET();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
  });

  it("asks MinIO about the configured bucket", async () => {
    probes.db.mockImplementation(ok);
    probes.s3.mockImplementation(ok);
    await GET();
    expect(probes.s3.mock.calls[0][0].input).toEqual({ Bucket: "rewind" });
  });
});
