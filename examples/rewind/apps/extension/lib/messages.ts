import { browser } from "wxt/browser";
import type { EventKind } from "@rewind/schema";
import type { Span } from "./timeline";

export type CapturedEvent = {
  at: number;
  kind: EventKind;
  text: string;
  isError: boolean;
};

export type RecordMode = "tab" | "area" | "desktop";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
};

export type Message =
  | { type: "event"; event: CapturedEvent } // content -> background
  | { type: "events"; tabId: number; spans: Span[] } // -> Event[] (media time)
  | { type: "screenshot"; tabId: number } // popup -> background
  | {
      type: "record";
      tabId: number;
      mode: RecordMode;
      streamId?: string;
    } // popup -> background: opens the recorder window
  | { type: "recording"; tabId: number; since: number | null } // recorder -> background
  | { type: "select-area" } // background -> content: -> Rect | null
  | { type: "save-replay"; tabId: number }; // popup/command -> background

export function send<T = unknown>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
