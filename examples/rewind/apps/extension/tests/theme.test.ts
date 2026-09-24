// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "../lib/theme";

afterEach(() => {
  document.body.className = "";
  vi.unstubAllGlobals();
});

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches }) as unknown as typeof matchMedia,
  );
}

describe("applyTheme", () => {
  it("adds rw-dark for dark", () => {
    applyTheme("dark");
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });

  it("removes rw-dark for light", () => {
    document.body.classList.add("rw-dark");
    applyTheme("light");
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });

  it("follows prefers-color-scheme for system, dark", () => {
    mockMatchMedia(true);
    applyTheme("system");
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });

  it("follows prefers-color-scheme for system, light", () => {
    mockMatchMedia(false);
    applyTheme("system");
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });
});
