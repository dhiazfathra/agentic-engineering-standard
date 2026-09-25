import { test as setup } from "@playwright/test";
import { loginAsSeedUser, STORAGE_STATE_PATH } from "./auth";

// Runs once before the authenticated project (see playwright.config.ts):
// logs the seeded user in and saves the session cookie as storageState, so
// every test's `page`, `page.request` and `request` fixture is already
// logged in.
setup("authenticate as the seeded user", async ({ page }) => {
  await loginAsSeedUser(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
