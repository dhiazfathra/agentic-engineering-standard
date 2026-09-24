import { existsSync, readFileSync } from "node:fs";
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

test("the popup renders home, drafts and settings", async () => {
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

    await expect(
      page.getByRole("button", { name: "Capture screenshot" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Web app URL")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();

    // The drafts pill only renders once a draft exists, so seed one directly
    // in the extension's IndexedDB, then reload to pick it up.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("rewind", 1);
          open.onupgradeneeded = () => {
            open.result.createObjectStore("captures", { keyPath: "id" });
            open.result
              .createObjectStore("snapshots", {
                keyPath: "id",
                autoIncrement: true,
              })
              .createIndex("at", "at");
          };
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("captures", "readwrite");
            tx.objectStore("captures").put({
              id: "seed-draft",
              createdAt: Date.now(),
              url: "https://example.com/cart",
              kind: "screenshot",
              blob: new Blob(["x"], { type: "image/png" }),
              events: [],
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          open.onerror = () => reject(open.error);
        }),
    );
    await page.reload();
    await page.getByRole("button", { name: "1 draft unfinished" }).click();
    await expect(page.getByText("example.com/cart")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
  } finally {
    await context.close();
  }
});

test("the Firefox build exists", () => {
  const manifestPath = join(output, "firefox-mv3", "manifest.json");
  expect(existsSync(manifestPath)).toBe(true);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  expect(manifest.manifest_version).toBe(3);
});
