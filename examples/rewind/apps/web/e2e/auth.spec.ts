import { expect, test } from "@playwright/test";
import { SEED_EMAIL, SEED_PASSWORD } from "./auth";

// This project runs with no storageState (see playwright.config.ts), so
// every test here starts logged out.

test("unauthenticated / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logging in as the seeded user lands on the library", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByText("Checkout fails after applying coupon"),
  ).toBeVisible();
});

test("wrong password shows an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("signing up creates an account and lands on an empty library", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  const email = `e2e-signup-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-fresh-password");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Signup");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  // A brand-new workspace has none of the seeded Rewinds.
  await expect(
    page.getByText("Checkout fails after applying coupon"),
  ).not.toBeVisible();
});

test("logging out then visiting / redirects to /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/");

  await page.request.post("/api/auth/logout");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logging out from the workspace menu redirects to /login", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: /Dhiaz's Workspace/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a seeded Rewind's link works logged out (defaultLinkAccess anyone)", async ({
  page,
}) => {
  await page.goto("/r/seed-r1");
  await expect(page).toHaveURL("/r/seed-r1");
  await expect(page.getByText("Media unavailable")).toBeVisible();
});
