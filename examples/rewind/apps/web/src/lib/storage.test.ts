import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSignedUrl: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

const { mediaUrl, s3 } = await import("./storage");

it("points at the MinIO endpoint with path-style bucket URLs", async () => {
  const endpoint = await s3.config.endpoint!();
  expect(`${endpoint.protocol}//${endpoint.hostname}:${endpoint.port}`).toBe(
    "http://localhost:9000",
  );
  expect(s3.config.forcePathStyle).toBe(true);
});

it("signs with the configured MinIO keys", async () => {
  const creds = await s3.config.credentials();
  expect(creds.accessKeyId).toBe("rewind");
  expect(creds.secretAccessKey).toBe("rewind-local-secret");
});

it("signs a 1-hour GET URL for the media key", async () => {
  mocks.getSignedUrl.mockResolvedValue("https://signed.example/media");
  const url = await mediaUrl("rewinds/abc.png");
  expect(url).toBe("https://signed.example/media");
  expect(mocks.getSignedUrl).toHaveBeenCalledWith(
    s3,
    expect.objectContaining({
      input: expect.objectContaining({ Key: "rewinds/abc.png" }),
    }),
    { expiresIn: 3600 },
  );
});
