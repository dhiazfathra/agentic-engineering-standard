import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaKeyPattern } from "@rewind/schema";

const presign = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: presign }));
vi.mock("@/lib/storage", () => ({ s3: {} }));

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/uploads", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/uploads", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a presigned url and a key matching mediaKeyPattern", async () => {
    presign.mockResolvedValue("https://minio.example/signed");
    const res = await POST(request({ contentType: "video/webm" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://minio.example/signed");
    expect(body.key).toMatch(mediaKeyPattern);
    expect(presign).toHaveBeenCalledWith(
      {},
      expect.any(Object),
      expect.objectContaining({ expiresIn: 900 }),
    );
  });

  it("400s on an invalid content type", async () => {
    const res = await POST(request({ contentType: "application/pdf" }));
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
