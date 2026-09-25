import { expect, test } from "@playwright/test";

test.describe("viewer", () => {
  test("shows the title and the missing-media state", async ({ page }) => {
    await page.goto("/r/seed-r1");
    await expect(
      page.getByText("Checkout fails after applying coupon"),
    ).toBeVisible();
    await expect(page.getByText("Media unavailable")).toBeVisible();
  });

  test("each tab shows its row count", async ({ page }) => {
    await page.goto("/r/seed-r1");

    await page.getByRole("tab", { name: "Actions" }).click();
    await expect(page.locator('[class*="eventRow"]')).toHaveCount(6);

    await page.getByRole("tab", { name: "Console" }).click();
    await expect(page.locator('[class*="eventRow"]')).toHaveCount(3);

    await page.getByRole("tab", { name: "Network" }).click();
    await expect(page.locator('[class*="eventRow"]')).toHaveCount(4);

    await page.getByRole("tab", { name: /Comments/ }).click();
    await expect(page.locator('[class*="commentRow"]')).toHaveCount(2);

    await page.getByRole("tab", { name: "Summary" }).click();
    await expect(page.getByTestId("step")).toHaveCount(6);
  });

  test("clicking an event moves the time readout", async ({ page }) => {
    await page.goto("/r/seed-r1");
    await page.getByRole("tab", { name: "Actions" }).click();
    await page.locator('[class*="eventRow"]').first().click();
    await expect(page.getByText("0:00 / 0:42")).toBeVisible();
    await page.locator('[class*="eventRow"]').nth(1).click();
    await expect(page.getByText("0:02 / 0:42")).toBeVisible();
  });

  test("Copy link puts the origin + /r/seed-r1 on the clipboard", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/r/seed-r1");
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(`${baseURL}/r/seed-r1`);
  });

  test("a screenshot has no timeline", async ({ page }) => {
    await page.goto("/r/seed-r4");
    await expect(page.getByRole("slider")).toHaveCount(0);
  });

  test("omits Send to Linear when INTEGRATIONS is off", async ({ page }) => {
    await page.goto("/r/seed-r1");
    await expect(
      page.getByRole("button", { name: "Send to Linear" }),
    ).toHaveCount(0);
  });

  test("an unknown id is a 404", async ({ page }) => {
    const res = await page.goto("/r/unknown");
    expect(res?.status()).toBe(404);
  });

  // src/db/seed.ts gives seed-r2 and seed-r3 the same first error event as
  // seed-r1, so all three group under one errorSignature
  // (SPEC-design-parity.md § Decisions #3).
  test("lists the other Rewinds sharing r1's errorSignature", async ({
    page,
  }) => {
    await page.goto("/r/seed-r1");
    await expect(
      page.getByText("3 Rewinds share this error"),
    ).toBeVisible();
  });
});
