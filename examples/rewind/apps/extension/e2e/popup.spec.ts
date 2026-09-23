import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";

const output = join(process.cwd(), ".output");

test("the Chrome build loads unpacked and its popup renders", async () => {
  const dist = join(output, "chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.getByRole("heading", { name: "rewind" })).toBeVisible();
    await expect(page).toHaveTitle("Rewind");
  } finally {
    await context.close();
  }
});

test("the Firefox build exists", () => {
  expect(existsSync(join(output, "firefox-mv2", "manifest.json"))).toBe(true);
});
