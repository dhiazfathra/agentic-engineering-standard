import { join } from "node:path";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { chromium, expect } from "@playwright/test";
import { WEB_URL } from "../playwright.config";

// These run inside `worker.evaluate`/`page.evaluate`, in the extension's own
// browser context, which has no @types/chrome installed here.
declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    session: {
      get(key: string): Promise<Record<string, unknown>>;
    };
  };
  tabs: { query(info: { url: string }): Promise<{ id: number }[]> };
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

const output = join(process.cwd(), ".output");
export const FIXTURE_URL = "http://localhost:3300/";
const FIXTURE_TITLE = "Rewind fixture";

// Matches apps/web/src/db/seed.ts's seeded Admin login (ADR-0003 session auth).
const SEED_EMAIL = "dhiazfathra@gmail.com";
const SEED_PASSWORD = "rewind-dev";

const FIXTURE_HTML = `<!doctype html>
<html><head><title>${FIXTURE_TITLE}</title></head>
<body>
<h1>Rewind fixture</h1>
<script>
  console.log("fixture loaded");
  fetch("/api/health").catch(() => {});
</script>
</body></html>`;

/** Launches the built Chrome extension unpacked, alongside its own worker. */
export async function launchExtension(): Promise<{
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
}> {
  const dist = join(output, "chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--auto-select-tab-capture-source-by-title=${FIXTURE_TITLE}`,
    ],
  });
  // The web app's routes now require a session (ADR-0003). The extension's
  // uploads/rewinds fetches send `credentials: "include"`, so logging in
  // once here, on this context's cookie jar, is enough for every request
  // this context later makes to WEB_URL.
  const loginRes = await context.request.post(`${WEB_URL}/api/auth/login`, {
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `extension e2e: seed login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
  }
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

/** Merges `patch` into the extension's `local:settings` (stored as chrome.storage.local key "settings"). */
export async function setSettings(
  worker: Worker,
  patch: Record<string, unknown>,
): Promise<void> {
  await worker.evaluate(async (p) => {
    const current =
      ((await chrome.storage.local.get("settings")).settings as
        Record<string, unknown> | undefined) ?? {};
    await chrome.storage.local.set({ settings: { ...current, ...p } });
  }, patch);
}

/** Opens the fake `http://localhost:3300` fixture page (data: URLs are not a secure context for media capture). */
export async function openFixture(context: BrowserContext): Promise<Page> {
  await context.route(`${FIXTURE_URL}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: FIXTURE_HTML }),
  );
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  return page;
}

/**
 * Sends a message to the background from an extension page, targeting the
 * fixture tab. Brings the fixture to front after opening the helper tab:
 * `captureVisibleTab` needs it active in its window, as it is when a user
 * clicks the popup.
 */
export async function sendToFixture(
  context: BrowserContext,
  extensionId: string,
  fixture: Page,
  message: Record<string, unknown>,
): Promise<unknown> {
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/popup.html`);
  await fixture.bringToFront();
  const [fixtureTab] = await helper.evaluate(() =>
    chrome.tabs.query({ url: "http://localhost:3300/*" }),
  );
  const tabId = (fixtureTab as { id: number }).id;
  const result = await helper.evaluate(
    ([msg, tabId]) => chrome.runtime.sendMessage({ ...(msg as object), tabId }),
    [message, tabId] as const,
  );
  await helper.close();
  return result;
}

// The MV3 background service worker is torn down and respawned by the
// browser whenever it's been idle, which invalidates any `Worker` handle
// held across a multi-second poll ("Target page, context or browser has
// been closed"). An extension page doesn't idle-terminate that way, so each
// evaluate below opens a short-lived one instead of reusing `worker`.
async function evalInExtension<T, Arg>(
  context: BrowserContext,
  extensionId: string,
  fn: (arg: Arg) => T | Promise<T>,
  arg: Arg,
): Promise<T> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    // Playwright's `Unboxed<Arg>` check can't see through this generic
    // wrapper; callers below pass plain JSON-serializable values.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (page.evaluate as any)(fn, arg);
  } finally {
    await page.close();
  }
}

/** The fixture tab's id, resolved via the extension's own `tabs.query`. */
async function fixtureTabId(
  context: BrowserContext,
  extensionId: string,
): Promise<number> {
  const [tab] = await evalInExtension(
    context,
    extensionId,
    () => chrome.tabs.query({ url: "http://localhost:3300/*" }),
    undefined,
  );
  return (tab as { id: number }).id;
}

/** Polls the extension's `rewind`/`snapshots` IndexedDB store until the fixture tab has `min` snapshots. */
export async function waitForSnapshots(
  context: BrowserContext,
  extensionId: string,
  min: number,
  timeout = 20_000,
): Promise<void> {
  const tabId = await fixtureTabId(context, extensionId);
  await expect
    .poll(
      () =>
        evalInExtension(
          context,
          extensionId,
          (id) =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open("rewind", 1);
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const req = open.result
                  .transaction("snapshots", "readonly")
                  .objectStore("snapshots")
                  .getAll();
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                  const rows = req.result as { tabId: number }[];
                  resolve(rows.filter((r) => r.tabId === id).length);
                };
              };
            }),
          tabId,
        ),
      { timeout },
    )
    .toBeGreaterThanOrEqual(min);
}

/** Polls `chrome.storage.session`'s debounced tab buffer until every pattern matches a captured event's text. */
export async function waitForBufferEvents(
  context: BrowserContext,
  extensionId: string,
  patterns: RegExp[],
  timeout = 10_000,
): Promise<void> {
  const tabId = await fixtureTabId(context, extensionId);
  await expect
    .poll(
      async () => {
        const texts = await evalInExtension(
          context,
          extensionId,
          async (id) => {
            const stored = (await chrome.storage.session.get("buffer"))
              .buffer as Record<number, { text: string }[]> | undefined;
            return (stored?.[id] ?? []).map((e) => e.text);
          },
          tabId,
        );
        return patterns.every((p) => texts.some((t) => p.test(t)));
      },
      { timeout },
    )
    .toBe(true);
}

export { WEB_URL };
