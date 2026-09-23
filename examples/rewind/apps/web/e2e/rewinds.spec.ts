import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { expect, test } from "@playwright/test";
import { localEnv } from "../local-env";

// Real S3_ENDPOINT (e.g. a port-remapped MinIO for local runs) overrides
// the .env.example default, same as playwright.config.ts.
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? localEnv.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: localEnv.S3_ACCESS_KEY,
    secretAccessKey: localEnv.S3_SECRET_KEY,
  },
});

test("uploads to MinIO, creates and fetches a Rewind, then deletes it", async ({
  request,
}) => {
  const uploadRes = await request.post("/api/uploads", {
    data: { contentType: "video/webm" },
  });
  expect(uploadRes.status()).toBe(200);
  const { url, key } = await uploadRes.json();

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "video/webm" },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  expect(putRes.status).toBe(200);

  const createRes = await request.post("/api/rewinds", {
    data: {
      title: "e2e upload",
      url: "https://example.com/cart",
      reporterName: "e2e",
      kind: "video",
      mediaKey: key,
      durationSeconds: 3,
      events: [],
    },
  });
  expect(createRes.status()).toBe(201);
  const rewind = await createRes.json();

  const getRes = await request.get(`/api/rewinds/${rewind.id}`);
  expect(getRes.status()).toBe(200);
  const fetched = await getRes.json();
  expect(fetched.id).toBe(rewind.id);
  expect(fetched.mediaKey).toBe(key);

  await expect(
    s3.send(new HeadObjectCommand({ Bucket: localEnv.S3_BUCKET, Key: key })),
  ).resolves.toBeDefined();

  const deleteRes = await request.delete(`/api/rewinds/${rewind.id}`);
  expect(deleteRes.status()).toBe(200);

  await expect(
    s3.send(new HeadObjectCommand({ Bucket: localEnv.S3_BUCKET, Key: key })),
  ).rejects.toThrow();
});

test("rejects a PUT whose Content-Type does not match the signed upload URL", async ({
  request,
}) => {
  const uploadRes = await request.post("/api/uploads", {
    data: { contentType: "video/webm" },
  });
  expect(uploadRes.status()).toBe(200);
  const { url } = await uploadRes.json();

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  expect(putRes.status).toBeGreaterThanOrEqual(300);
});
