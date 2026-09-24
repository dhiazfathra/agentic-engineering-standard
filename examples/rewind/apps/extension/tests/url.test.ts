import { describe, expect, it } from "vitest";
import { isHttpUrl } from "../lib/url";

describe("isHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com/page?x=1")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isHttpUrl(undefined)).toBe(false);
  });

  it("rejects a bare scheme with no host", () => {
    expect(isHttpUrl("https://")).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isHttpUrl("chrome://extensions")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
  });

  it("rejects garbage that isn't a URL", () => {
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});
