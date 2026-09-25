// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, setTheme, storeTheme, THEME_INIT_SCRIPT } from "./theme";

afterEach(() => {
  document.body.className = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("THEME_INIT_SCRIPT", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("adds rw-dark when the stored theme is dark", () => {
    localStorage.setItem("rewind-theme", "dark");
    run();
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });

  it("leaves rw-dark off for light or an empty store", () => {
    run();
    expect(document.body.classList.contains("rw-dark")).toBe(false);
    localStorage.setItem("rewind-theme", "light");
    run();
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });
});

describe("applyTheme", () => {
  it("adds rw-dark when true, removes it when false", () => {
    applyTheme(true);
    expect(document.body.classList.contains("rw-dark")).toBe(true);
    applyTheme(false);
    expect(document.body.classList.contains("rw-dark")).toBe(false);
  });
});

describe("storeTheme", () => {
  it("persists dark and light", () => {
    storeTheme(true);
    expect(localStorage.getItem("rewind-theme")).toBe("dark");
    storeTheme(false);
    expect(localStorage.getItem("rewind-theme")).toBe("light");
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => storeTheme(true)).not.toThrow();
  });
});

describe("setTheme", () => {
  it("applies the class and stores the value", () => {
    setTheme(true);
    expect(document.body.classList.contains("rw-dark")).toBe(true);
    expect(localStorage.getItem("rewind-theme")).toBe("dark");
  });

  it("still applies the class when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setTheme(true);
    expect(document.body.classList.contains("rw-dark")).toBe(true);
  });
});
