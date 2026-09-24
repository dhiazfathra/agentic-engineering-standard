import { browser } from "wxt/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { send } from "../lib/messages";

describe("send", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards the message to browser.runtime.sendMessage and returns its result", async () => {
    const spy = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({ ok: true } as never);
    const message = { type: "screenshot", tabId: 1 } as const;
    const result = await send<{ ok: boolean }>(message);
    expect(spy).toHaveBeenCalledWith(message);
    expect(result).toEqual({ ok: true });
  });
});
