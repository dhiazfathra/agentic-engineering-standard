import { expect, test } from "@playwright/test";

// Seeded ids used read-only elsewhere (viewer.spec.ts asserts on seed-r1's
// title and seed-r4's kind), so this spec never renames or deletes them.
// Each destructive test below picks its own untouched seeded Rewind.
//
// A tall viewport keeps every "Actions for …" button and its context menu
// on screen: the menu renders at the click's viewport coordinates, and a
// button near the end of the list otherwise needs a scroll the menu itself
// doesn't get.
test.use({ viewport: { width: 1280, height: 1800 } });

test.describe("library", () => {
  // Uses seed-r4 ("Avatar upload…"), not seed-r2 or seed-r3: those two now
  // share seed-r1's errorSignature (SPEC-design-parity.md § Decisions #3),
  // so Group duplicates (on by default) collapses them into r1's card.
  test("all three views render seeded Rewinds and open the viewer", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Avatar upload crops the wrong side"),
    ).toBeVisible();

    await page.getByRole("radio", { name: "List" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(
      page.getByText("Avatar upload crops the wrong side"),
    ).toBeVisible();

    await page.getByRole("radio", { name: "Board" }).click();
    await expect(page).toHaveURL(/view=board/);
    await expect(
      page.getByText("Avatar upload crops the wrong side"),
    ).toBeVisible();

    await page
      .getByRole("link", { name: "Avatar upload crops the wrong side" })
      .click();
    await expect(page).toHaveURL("/r/seed-r4");
  });

  test("folder filter shows only that folder's Rewinds, counts match", async ({
    page,
  }) => {
    await page.goto("/?folder=seed-folder-checkout");
    await expect(
      page.getByText("Checkout fails after applying coupon"),
    ).toBeVisible();
    await expect(page.getByText("Checkout button spins forever")).toBeVisible();
    await expect(page.getByText("Invoice PDF missing tax line")).toBeVisible();
    await expect(
      page.getByText("Coupon total shows NaN on mobile"),
    ).not.toBeVisible();
    await expect(page.getByText("3 Rewinds")).toBeVisible();
  });

  test("unknown folder id shows Folder not found", async ({ page }) => {
    await page.goto("/?folder=does-not-exist");
    await expect(page.getByText("Folder not found")).toBeVisible();
  });

  test("rename survives reload", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: "Actions for Search results flash empty state",
      })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: "Rewind title" });
    await input.fill("Search results flash — renamed");
    await input.press("Enter");
    await expect(
      page.getByText("Search results flash — renamed"),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByText("Search results flash — renamed"),
    ).toBeVisible();
  });

  test("folder create, rename and delete survive reload", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New folder" }).click();
    const nameInput = page.getByRole("textbox", { name: "Folder name" });
    await expect(nameInput).toBeVisible();
    await nameInput.fill("E2E folder");
    await nameInput.press("Enter");
    await expect(
      page.getByRole("button", { name: /^E2E folder/ }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: /^E2E folder/ }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Actions for folder E2E folder" })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const renameInput = page.getByRole("textbox", { name: "Folder name" });
    await renameInput.fill("E2E folder renamed");
    await renameInput.press("Enter");
    await expect(
      page.getByRole("button", { name: /^E2E folder renamed/ }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: /^E2E folder renamed/ }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Actions for folder E2E folder renamed" })
      .click();
    await page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(
      page.getByRole("button", { name: /^E2E folder renamed/ }),
    ).toHaveCount(0);
    // The DELETE is deferred until the toast closes (spec: no timer, sent
    // on × or on leaving the page). Close it, then wait for the database to
    // drop the folder, so the reload below checks the database rather than
    // racing the in-flight DELETE.
    await page.getByRole("button", { name: "Close" }).click();
    await expect
      .poll(async () =>
        (
          (await (await request.get("/api/folders")).json()) as {
            name: string;
          }[]
        )
          .map((f) => f.name)
          .includes("E2E folder renamed"),
      )
      .toBe(false);

    await page.reload();
    await expect(
      page.getByRole("button", { name: /^E2E folder renamed/ }),
    ).toHaveCount(0);
  });

  test("move to folder via context menu survives reload", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: "Actions for Date picker off by one day in Safari",
      })
      .click();
    await page.getByRole("menuitem", { name: "Move to Checkout" }).click();

    await page.goto("/?folder=seed-folder-checkout");
    await expect(
      page.getByText("Date picker off by one day in Safari"),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByText("Date picker off by one day in Safari"),
    ).toBeVisible();
  });

  test("board drag changes status and survives reload", async ({ page }) => {
    await page.goto("/?view=board");
    const card = page.getByText("Avatar upload crops the wrong side");
    const doneColumn = page.locator('section[aria-label="Fixed"]');
    await card.dragTo(doneColumn);
    await expect(page.getByText("Moved to Fixed")).toBeVisible();

    await page.reload();
    await expect(
      page
        .locator('section[aria-label="Fixed"]')
        .getByText("Avatar upload crops the wrong side"),
    ).toBeVisible();
  });

  test("delete then Undo leaves the Rewind after reload", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: "Actions for Dark mode toggle resets on reload",
      })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Rewind deleted")).toBeVisible();
    await expect(
      page.getByText("Dark mode toggle resets on reload"),
    ).not.toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByText("Dark mode toggle resets on reload"),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByText("Dark mode toggle resets on reload"),
    ).toBeVisible();
  });

  test("delete then × removes it; nothing is sent while the toast is open", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Actions for Invoice PDF missing tax line" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Rewind deleted")).toBeVisible();

    // Toast still open: the DELETE has not been sent yet.
    const stillThere = await request.get("/api/rewinds/seed-r7");
    expect(stillThere.status()).toBe(200);

    await page.getByRole("button", { name: "Close" }).click();
    await expect
      .poll(async () => (await request.get("/api/rewinds/seed-r7")).status())
      .toBe(404);

    await page.reload();
    await expect(
      page.getByText("Invoice PDF missing tax line"),
    ).not.toBeVisible();
  });

  test("⌘K palette opens a Rewind by title", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle dark mode" }).waitFor();
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox", { name: "Search or jump to…" });
    await expect(input).toBeVisible();
    await input.fill("Coupon total shows NaN");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/r/seed-r2");
  });

  test("dark mode survives reload and applies on the viewer with no flash", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("body")).toHaveClass(/rw-dark/);

    await page.reload();
    await expect(page.locator("body")).toHaveClass(/rw-dark/);

    await page.goto("/r/seed-r1");
    await expect(page.locator("body")).toHaveClass(/rw-dark/);

    // Turn it back off so later runs/specs start from a known state.
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("body")).not.toHaveClass(/rw-dark/);
  });
});
