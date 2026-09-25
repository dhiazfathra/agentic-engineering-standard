import { expect, test } from "@playwright/test";
import { SEED_EMAIL } from "./auth";

// Seeded Admin (see auth.ts) and their workspace: src/db/seed.ts renames the
// migration's default workspace to "Dhiaz's Workspace" and adds Maya, Leo
// and Sara as members alongside the seeded Admin.
const SEED_WORKSPACE_NAME = "Dhiaz's Workspace";

test("navigates between built settings tabs via the left nav", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await page.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  await page.getByRole("link", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  await page.getByRole("link", { name: "Back to app" }).click();
  await expect(page).toHaveURL("/");
});

test("404s a tab gated by a flag that is off, and a chunk-7 tab", async ({
  page,
}) => {
  const billing = await page.goto("/settings/billing");
  expect(billing?.status()).toBe(404);
  const integrations = await page.goto("/settings/integrations");
  expect(integrations?.status()).toBe(404);
});

test("404s the flag-gated /helpdesk page", async ({ page }) => {
  const res = await page.goto("/helpdesk");
  expect(res?.status()).toBe(404);
});

test("hides flagged nav items and never links to a chunk-7 tab", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Webhooks" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Integrations" }),
  ).toHaveCount(0);
});

test("edits the workspace name and default link access", async ({ page }) => {
  await page.goto("/settings/general");
  const nameInput = page.locator("#ws-name");
  await expect(nameInput).toHaveValue(SEED_WORKSPACE_NAME);
  await nameInput.fill(`${SEED_WORKSPACE_NAME} Inc`);
  await nameInput.blur();
  await expect(page.locator('[class*="savingHint"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#ws-name")).toHaveValue(
    `${SEED_WORKSPACE_NAME} Inc`,
  );
  // Restore the seed value so other specs relying on it are unaffected.
  await page.locator("#ws-name").fill(SEED_WORKSPACE_NAME);
  await page.locator("#ws-name").blur();

  await page
    .getByLabel("Default link access")
    .selectOption({ label: "Workspace members" });
  await page.reload();
  await expect(page.getByLabel("Default link access")).toHaveValue("members");
  await page
    .getByLabel("Default link access")
    .selectOption({ label: "Anyone with the link" });
});

test("shows seeded members and sends an invite", async ({ page }) => {
  await page.goto("/settings/members");
  await expect(page.locator(`text=${SEED_EMAIL}`)).toBeVisible();
  const before = await page.locator('[class*="tableRow"]').count();
  await page.getByRole("button", { name: "+ Add members" }).click();
  await page
    .getByPlaceholder("Separate emails with a space")
    .fill("new-e2e@acme.co");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.locator("text=Invite sent")).toBeVisible();
  // Invites don't create a membership row until accepted, so the table
  // count doesn't change; the toast above is the observable outcome.
  await expect(page.locator('[class*="tableRow"]')).toHaveCount(before);
});

test("copies the invite link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/settings/members");
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.locator("text=Link copied")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("/team-invite/");
});

test("edits the account name and toggles a notification", async ({
  page,
}) => {
  await page.goto("/settings/account");
  const first = page.locator("#acct-first");
  const original = await first.inputValue();
  await first.fill("E2E");
  await first.blur();
  await page.reload();
  await expect(page.locator("#acct-first")).toHaveValue("E2E");
  await page.locator("#acct-first").fill(original);
  await page.locator("#acct-first").blur();

  await page.goto("/settings/notifications");
  const toggle = page.getByRole("switch").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).not.toHaveAttribute("aria-checked", before ?? "");
  // Restore it so other e2e runs start from the seeded defaults.
  await toggle.click();
});
