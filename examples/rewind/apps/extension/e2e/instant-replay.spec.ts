import { expect, test } from "@playwright/test";
import {
  launchExtension,
  openFixture,
  sendToFixture,
  setSettings,
  WEB_URL,
} from "./fixtures";

test("instant replay: saves the last few seconds and files a playable video", async () => {
  const { context, worker, extensionId } = await launchExtension();
  try {
    await setSettings(worker, {
      appUrl: WEB_URL,
      reporterName: "e2e",
      openInNewTab: true,
      instantReplay: true,
    });
    const fixture = await openFixture(context);
    await fixture.bringToFront();
    await fixture.waitForTimeout(4000);

    const [editor] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("editor.html"),
        timeout: 30_000,
      }),
      sendToFixture(context, extensionId, fixture, { type: "save-replay" }),
    ]);
    await editor.waitForSelector("video", { timeout: 30_000 });

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
    // Chromium can report `Infinity` for a live-muxed webm's duration until a
    // seek resolves it; the time readout (driven by the app's own timeline)
    // is the reliable signal either way.
    await expect(viewer.getByText(/^0:00 \/ 0:0[2-9]$/)).toBeVisible();
  } finally {
    await context.close();
  }
});
