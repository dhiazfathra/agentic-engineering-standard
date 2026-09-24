import { expect, test } from "@playwright/test";
import {
  launchExtension,
  openFixture,
  sendToFixture,
  setSettings,
  WEB_URL,
} from "./fixtures";

test("desktop recording: records, stops and files a playable video", async () => {
  const { context, worker, extensionId } = await launchExtension();
  try {
    await setSettings(worker, {
      appUrl: WEB_URL,
      reporterName: "e2e",
      openInNewTab: true,
      micOn: false,
    });
    const fixture = await openFixture(context);

    const [recorder] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("recorder.html"),
      }),
      sendToFixture(context, extensionId, fixture, {
        type: "record",
        mode: "desktop",
      }),
    ]);
    await recorder
      .getByRole("button", { name: "Choose what to record" })
      .click();

    // Chrome auto-selects the fixture tab via
    // --auto-select-tab-capture-source-by-title, so no real picker appears.
    // Wait out the countdown for recording to start (the elapsed timer
    // appears), then wait for it to read at least 3 seconds in.
    const timer = recorder.getByText(/^\d+:\d{2}$/);
    await timer.waitFor({ timeout: 15_000 });
    await expect
      .poll(async () => (await timer.textContent()) ?? "", {
        timeout: 15_000,
      })
      .toMatch(/^0:0[3-9]$/);

    const [editor] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("editor.html"),
        timeout: 30_000,
      }),
      recorder.getByRole("button", { name: "Stop" }).click(),
    ]);
    await editor.waitForSelector("video");
    const [viewer] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("/r/"),
      }),
      editor.getByRole("button", { name: "Create link" }).click(),
    ]);
    await viewer.waitForLoadState();
    await expect(viewer.getByText("Media unavailable")).toHaveCount(0);

    const video = viewer.locator("video");
    await expect(video).toBeVisible();
    await expect
      .poll(
        async () => {
          const duration = await video.evaluate(
            (el: HTMLVideoElement) => el.duration,
          );
          return Number.isFinite(duration) ? duration : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(1);
  } finally {
    await context.close();
  }
});
