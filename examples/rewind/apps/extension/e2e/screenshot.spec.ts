import { expect, test } from "@playwright/test";
import {
  launchExtension,
  openFixture,
  sendToFixture,
  setSettings,
  waitForBufferEvents,
  WEB_URL,
} from "./fixtures";

test("screenshot: files a Rewind whose viewer shows the image, console and network rows", async () => {
  const { context, worker, extensionId } = await launchExtension();
  try {
    await setSettings(worker, {
      appUrl: WEB_URL,
      reporterName: "e2e",
      openInNewTab: true,
    });
    const fixture = await openFixture(context);
    await waitForBufferEvents(context, extensionId, [
      /fixture loaded/,
      /\/api\/health/,
    ]);

    const [editor] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("editor.html"),
      }),
      sendToFixture(context, extensionId, fixture, { type: "screenshot" }),
    ]);
    await editor.waitForSelector("img[alt='Screenshot']");

    // Draw a box on the screenshot.
    const screenshotImage = editor.locator("img[alt='Screenshot']");
    const box = (await screenshotImage.boundingBox())!;
    await editor.mouse.move(box.x + 20, box.y + 20);
    await editor.mouse.down();
    await editor.mouse.move(box.x + 80, box.y + 80);
    await editor.mouse.up();

    const [viewer] = await Promise.all([
      context.waitForEvent("page", {
        predicate: (p) => p.url().includes("/r/"),
      }),
      editor.getByRole("button", { name: "Create link" }).click(),
    ]);
    await viewer.waitForLoadState();

    await expect(viewer.getByText("Media unavailable")).toHaveCount(0);
    const image = viewer.locator("img");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await viewer.getByRole("tab", { name: "Console" }).click();
    await expect(viewer.getByText("fixture loaded")).toBeVisible();
    await viewer.getByRole("tab", { name: "Network" }).click();
    await expect(viewer.getByText(/\/api\/health/)).toBeVisible();
  } finally {
    await context.close();
  }
});
