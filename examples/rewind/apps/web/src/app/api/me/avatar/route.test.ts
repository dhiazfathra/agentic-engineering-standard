import { beforeEach, describe, expect, it, vi } from "vitest";
import { avatarKeyPattern } from "@rewind/schema";

const presignPut = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ presignPut }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession };
});

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/me/avatar", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/me/avatar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireSession.mockResolvedValue({
      user: { id: "u1" },
      workspace: { id: "w1" },
      membership: { role: "Viewer" },
    });
  });

  it("401s when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    requireSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(
      request({ contentType: "image/png", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(401);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("returns a presigned url and a key matching avatarKeyPattern, no admin required", async () => {
    presignPut.mockResolvedValue("https://minio.example/signed");
    const res = await POST(
      request({ contentType: "image/gif", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://minio.example/signed");
    expect(body.key).toMatch(avatarKeyPattern);
    expect(presignPut).toHaveBeenCalledWith(
      expect.stringMatching(avatarKeyPattern),
      "image/gif",
    );
  });

  it("400s on an invalid content type", async () => {
    const res = await POST(
      request({ contentType: "video/webm", sizeBytes: 1000 }),
    );
    expect(res.status).toBe(400);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("400s when the declared size exceeds the 2MB limit", async () => {
    const res = await POST(
      request({ contentType: "image/png", sizeBytes: 2 * 1024 * 1024 + 1 }),
    );
    expect(res.status).toBe(400);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/me/avatar", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
