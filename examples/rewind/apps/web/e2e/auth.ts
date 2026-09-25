import type { Page } from "@playwright/test";

// Seeded in src/db/seed.ts: Admin of the default workspace, which owns
// every seeded Rewind/folder/link.
export const SEED_EMAIL = "dhiazfathra@gmail.com";
export const SEED_PASSWORD = "rewind-dev";

// Where auth.setup.ts saves the logged-in session, and where
// playwright.config.ts points the authenticated project's storageState.
export const STORAGE_STATE_PATH = "e2e/.auth/user.json";

/**
 * Logs the seeded user in via the real API, on `page`'s own request
 * context so the `rw_session` cookie it sets is shared with `page`'s
 * subsequent navigations and `request.*` calls.
 */
export async function loginAsSeedUser(page: Page): Promise<void> {
  const res = await page.request.post("/api/auth/login", {
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`seed login failed: ${res.status()} ${await res.text()}`);
  }
}
