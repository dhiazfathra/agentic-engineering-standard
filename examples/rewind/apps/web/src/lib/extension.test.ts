// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { pingExtension } from "./extension";

describe("pingExtension", () => {
  it("resolves false when nothing answers within the timeout", async () => {
    vi.useFakeTimers();
    const result = pingExtension(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("resolves true when a same-origin pong arrives", async () => {
    const result = pingExtension(1000);
    window.postMessage({ type: "rewind-extension-pong" }, "*");
    await expect(result).resolves.toBe(true);
  });

  it("ignores messages of another type or from another window", async () => {
    vi.useFakeTimers();
    const result = pingExtension(20);
    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "other" }, source: window }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "rewind-extension-pong" },
        source: null,
      }),
    );
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toBe(false);
    vi.useRealTimers();
  });
});
