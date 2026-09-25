import { beforeEach, describe, expect, it, vi } from "vitest";

function chain(resolved: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["values", "onConflictDoNothing", "where"]) {
    obj[m] = vi.fn(() => obj);
  }
  return Object.assign(Promise.resolve(resolved), obj);
}

const adminSession = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Admin" },
};
const viewerSession = {
  user: { id: "u1" },
  workspace: { id: "w1" },
  membership: { role: "Viewer" },
};

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  delete: vi.fn(),
  requireSession: vi.fn(),
  flags: { INTEGRATIONS: true },
}));
vi.mock("@/lib/db", () => ({
  db: { insert: mocks.insert, delete: mocks.delete },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: mocks.requireSession };
});
vi.mock("@/lib/flags", () => ({ flags: mocks.flags }));

import { DELETE, POST } from "./route";

const params = (name: string) => Promise.resolve({ name });

describe("POST /api/integrations/[name]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.flags.INTEGRATIONS = true;
    mocks.requireSession.mockResolvedValue(adminSession);
    mocks.insert.mockReturnValue(chain(undefined));
  });

  it("404s when the flag is off", async () => {
    mocks.flags.INTEGRATIONS = false;
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: params("Linear"),
    });
    expect(res.status).toBe(404);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: params("Linear"),
    });
    expect(res.status).toBe(401);
  });

  it("403s for a non-Admin", async () => {
    mocks.requireSession.mockResolvedValue(viewerSession);
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: params("Linear"),
    });
    expect(res.status).toBe(403);
  });

  it("404s an integration not in the catalog", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: params("Nope"),
    });
    expect(res.status).toBe(404);
  });

  it("connects a catalog integration", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: params("Linear"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Linear", connected: true });
  });
});

describe("DELETE /api/integrations/[name]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.flags.INTEGRATIONS = true;
    mocks.requireSession.mockResolvedValue(adminSession);
    mocks.delete.mockReturnValue(chain(undefined));
  });

  it("404s when the flag is off", async () => {
    mocks.flags.INTEGRATIONS = false;
    const res = await DELETE(new Request("http://localhost"), {
      params: params("Linear"),
    });
    expect(res.status).toBe(404);
  });

  it("401s without a session", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(new Request("http://localhost"), {
      params: params("Linear"),
    });
    expect(res.status).toBe(401);
  });

  it("403s for a non-Admin", async () => {
    mocks.requireSession.mockResolvedValue(viewerSession);
    const res = await DELETE(new Request("http://localhost"), {
      params: params("Linear"),
    });
    expect(res.status).toBe(403);
  });

  it("disconnects an integration", async () => {
    const res = await DELETE(new Request("http://localhost"), {
      params: params("Linear"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Linear", connected: false });
  });
});
