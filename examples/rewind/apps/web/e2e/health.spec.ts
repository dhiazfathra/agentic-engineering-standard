import { expect, test } from "@playwright/test";

test("health reports the real database and MinIO as ok", async ({
  request,
}) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ database: "ok", storage: "ok" });
});
