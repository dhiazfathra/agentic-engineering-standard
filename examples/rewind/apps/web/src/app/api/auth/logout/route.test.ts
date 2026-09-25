import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { delete: mocks.delete } }));
vi.mock("@/lib/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, clearSessionCookie: mocks.clearSessionCookie };
});

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.resetAllMocks());

  it("clears the cookie and does nothing else when there is no cookie header", async () => {
    const res = await POST(new Request("http://localhost"));
    expect(res.status).toBe(200);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.clearSessionCookie).toHaveBeenCalled();
  });

  it("deletes the matching session row when a token is present", async () => {
    const where = vi.fn(() => Promise.resolve());
    mocks.delete.mockReturnValue({ where });
    const res = await POST(
      new Request("http://localhost", {
        headers: { cookie: "other=1; rw_session=tok" },
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });
});
