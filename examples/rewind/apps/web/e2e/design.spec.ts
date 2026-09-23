import { expect, test } from "@playwright/test";

test("the design's tokens apply", async ({ page }) => {
  await page.goto("/");
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-primary")
      .trim(),
  );
  expect(primary).toBe("#01afaf");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("--rw-accent").trim(),
  );
  // --rw-accent is var(--color-primary) in the design, resolved by the browser.
  expect(accent).toBe("#01afaf");
});

test("body text renders in Inter", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => f.family),
  );
  expect(families.some((f) => /inter/i.test(f))).toBe(true);
  const bodyFont = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  expect(bodyFont).toMatch(/inter/i);
});
