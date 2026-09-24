import { join } from "node:path";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { chromium } from "@playwright/test";
import { WEB_URL } from "../playwright.config";

// These run inside `worker.evaluate`/`page.evaluate`, in the extension's own
// browser context, which has no @types/chrome installed here.
declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: { query(info: { url: string }): Promise<{ id: number }[]> };
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

const output = join(process.cwd(), ".output");
export const FIXTURE_URL = "http://localhost:3300/";
const FIXTURE_TITLE = "Rewind fixture";

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

export { WEB_URL };
