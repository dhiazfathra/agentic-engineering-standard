import { expect, test } from "@playwright/test";

// /rec/[id] is public (no session, no storageState needed): the recording
// link id is its own capability. Runs as part of the "authenticated"
// project purely for convenience (no login is performed or required).

test("shows the ready-to-record card for a known recording link", async ({
  page,
}) => {
  await page.goto("/rec/seed-link-beta-testers");
  await expect(page.locator("text=Ready to record?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording" }),
  ).toBeVisible();
});

test("404s for an unknown recording link id", async ({ page }) => {
  const res = await page.goto("/rec/does-not-exist");
  expect(res?.status()).toBe(404);
});
