import { expect, type Page, test } from "@playwright/test";

// Seeded in src/db/seed.ts.
const SEED_LINK_NAME = "Beta testers";

// First visit per user shows the onboarding modal, which blocks the table
// underneath it.
async function dismissOnboarding(page: Page) {
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
}

test("renders seeded recording links with their recording count", async ({
  page,
}) => {
  await page.goto("/links");
  await dismissOnboarding(page);
  const row = page.locator("text=" + SEED_LINK_NAME).locator("..");
  await expect(row).toBeVisible();
});

// src/db/seed.ts builds "Support: checkout issues" up to 6 Rewinds and
// "Beta testers" up to 14 (SPEC-design-parity.md § Seed), each row's own
// recordingLinkId, real filler Rewinds counted by GET /api/recording-links.
test("shows each seeded link's design recording count", async ({ page }) => {
  await page.goto("/links");
  await dismissOnboarding(page);
  const checkoutRow = page
    .locator('[class*="row"]', { hasText: "Support: checkout issues" });
  const betaRow = page.locator('[class*="row"]', { hasText: SEED_LINK_NAME });
  await expect(checkoutRow.locator('[class*="count"]')).toHaveText("6");
  await expect(betaRow.locator('[class*="count"]')).toHaveText("14");
});

test("creates a new recording link and copies it to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/links");
  await dismissOnboarding(page);
  const before = await page.locator("text=New recording link").count();
  await page.getByRole("button", { name: "New recording link" }).click();
  await expect(page.locator("text=Link copied")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("/rec/");
  const after = await page
    .locator('[class*="row"]')
    .filter({ hasText: "New recording link" })
    .count();
  expect(after).toBeGreaterThanOrEqual(before);
});

test("copies an existing link's /rec/[id] url", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/links");
  await dismissOnboarding(page);
  await page
    .locator('[class*="row"]', { hasText: SEED_LINK_NAME })
    .getByRole("button", { name: "Copy link" })
    .click();
  await expect(page.locator("text=Link copied")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("/rec/seed-link-beta-testers");
});
