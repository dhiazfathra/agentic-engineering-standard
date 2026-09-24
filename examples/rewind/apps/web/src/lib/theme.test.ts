// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, setTheme, storeTheme, THEME_INIT_SCRIPT } from "./theme";

afterEach(() => {
  document.body.className = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("THEME_INIT_SCRIPT", () => {
  it("is a fixed string that reads rewind-theme in a try/catch", () => {
    expect(THEME_INIT_SCRIPT).toContain("rewind-theme");
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch(e){}");
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
