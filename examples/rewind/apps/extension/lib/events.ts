import type { EventKind } from "@rewind/schema";
import type { CapturedEvent } from "./messages";

/** `92ms` under a second, `1.2s` at or above it. */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// fetch/XHR always resolve `url` to a full URL before it reaches here.
function sameOrigin(url: string, pageOrigin: string): boolean {
  return new URL(url).origin === pageOrigin;
}

function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/** `GET /api/cart · 200 · 92ms`, `failed` in place of the status on a network error. */
export function formatRequest(
  method: string,
  url: string,
  status: number | null,
  ms: number,
  pageOrigin: string,
): string {
  const shown = sameOrigin(url, pageOrigin) ? pathOf(url) : url;
  const mid = status === null ? "failed" : String(status);
  return `${method} ${shown} · ${mid} · ${formatDuration(ms)}`;
}

/** Console arguments joined with spaces; objects `JSON.stringify`d, falling back to `String()`. */
export function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      // `message`/`stack` are non-enumerable, so `JSON.stringify(error)` is
      // `"{}"` and the common `console.error(err)` pattern loses its text.
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
      try {
        const s = JSON.stringify(a);
        return s === undefined ? String(a) : s;
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** aria-label, label text, innerText, placeholder, name, then tag; cut at 60 chars. */
export function describeElement(el: Element): string {
  const attr = (name: string) => el.getAttribute(name)?.trim();
  let text = attr("aria-label");
  // `labels` covers both `<label for>` and a wrapping label; non-form elements have none.
  if (!text) text = (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
  if (!text) text = (el as HTMLElement).innerText?.trim();
  if (!text) text = attr("placeholder");
  if (!text) text = attr("name");
  if (!text) text = el.tagName.toLowerCase();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** `input`, `textarea`, `select`, or a contenteditable element. */
export function isFormField(el: Element): boolean {
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

export function clickText(el: Element): string {
  const label = describeElement(el);
  return isFormField(el) ? `Clicked “${label}” field` : `Clicked “${label}”`;
}

export function inputText(el: Element): string {
  return `Typed in “${describeElement(el)}” field`;
}

export function navText(url: string): string {
  const u = new URL(url);
  return `Navigated to ${u.host}${u.pathname}${u.search}`;
}

/** Stamps `at: Date.now()`. */
export function event(
  kind: EventKind,
  text: string,
  isError = false,
): CapturedEvent {
  return { at: Date.now(), kind, text, isError };
}
