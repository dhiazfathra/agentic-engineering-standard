import { fakeBrowser } from "wxt/testing/fake-browser";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULTS,
  resetSettings,
  settings,
  updateSettings,
} from "../lib/settings";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("settings", () => {
  it("falls back to DEFAULTS when unset", async () => {
    expect(await settings.getValue()).toEqual(DEFAULTS);
  });

  it("updateSettings merges a patch", async () => {
    await updateSettings({ reporterName: "Ada" });
    expect((await settings.getValue()).reporterName).toBe("Ada");
    expect((await settings.getValue()).appUrl).toBe(DEFAULTS.appUrl);
  });

  it("resetSettings restores DEFAULTS", async () => {
    await updateSettings({ reporterName: "Ada" });
    await resetSettings();
    expect(await settings.getValue()).toEqual(DEFAULTS);
  });
});
