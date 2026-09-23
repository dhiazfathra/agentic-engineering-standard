import { expect, it } from "vitest";
import { s3 } from "./storage";

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
