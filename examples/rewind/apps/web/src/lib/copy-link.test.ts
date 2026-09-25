// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { copyRewindLink, rewindLink } from "./copy-link";

afterEach(() => {
  vi.restoreAllMocks();
});

it("builds the origin-relative viewer link", () => {
  expect(rewindLink("seed-r1")).toBe(`${location.origin}/r/seed-r1`);
});

it("writes the link to the clipboard", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  await copyRewindLink("seed-r1");
  expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/seed-r1`);
});

it("rejects when the clipboard write fails", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    configurable: true,
  });
  await expect(copyRewindLink("seed-r1")).rejects.toThrow("denied");
});
