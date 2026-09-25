import { beforeEach, describe, expect, it, vi } from "vitest";
import { logoKeyPattern } from "@rewind/schema";

const presignPut = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ presignPut }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession };
});

import { PATCH } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/workspace/logo", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

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

describe("PATCH /api/workspace/logo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireSession.mockResolvedValue(adminSession);
  });

  it("401s when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(
      request({ contentType: "image/png", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(401);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("403s for a non-Admin", async () => {
    requireSession.mockResolvedValue(viewerSession);
    const res = await PATCH(
      request({ contentType: "image/png", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(403);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("returns a presigned url and a key matching logoKeyPattern", async () => {
    presignPut.mockResolvedValue("https://minio.example/signed");
    const res = await PATCH(
      request({ contentType: "image/jpeg", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://minio.example/signed");
    expect(body.key).toMatch(logoKeyPattern);
    expect(presignPut).toHaveBeenCalledWith(
      expect.stringMatching(logoKeyPattern),
      "image/jpeg",
    );
  });

  it("400s on an invalid content type", async () => {
    const res = await PATCH(
      request({ contentType: "application/pdf", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(400);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("400s when the declared size exceeds the 2MB limit", async () => {
    const res = await PATCH(
      request({ contentType: "image/png", sizeBytes: 2 * 1024 * 1024 + 1 }),
    );
    expect(res.status).toBe(400);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/workspace/logo", {
        method: "PATCH",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
