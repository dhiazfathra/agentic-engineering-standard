// SPEC-design-parity.md § Error signature. Pure, no DB access, so both the
// `POST /api/rewinds` route and the backfill script share it.

type SignatureEvent = { text: string; isError: boolean };

const QUOTED_STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;
// Hex ids (6+ hex chars) and UUIDs, before the generic number pass so their
// digits aren't caught by NUMBER first.
const HEX_OR_UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b0x[0-9a-f]+\b|\b[0-9a-f]{6,}\b/gi;
const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;
// `at fn (file:line:col)` or `fn@file:line:col`.
const STACK_FRAME =
  /at\s+([^\s(]+)\s+\(([^:)]+):\d+:\d+\)|([^\s@]+)@([^:]+):\d+:\d+/;

function urlToPath(match: string): string {
  try {
    const url = new URL(match);
    return url.pathname + url.search;
  } catch {
    return match;
  }
}

/**
 * Normalizes the first error event's text into a stable signature, so
 * duplicate errors that differ only in ids/numbers/timestamps group
 * together. Returns null when there is no error event.
 */
export function errorSignature(events: SignatureEvent[]): string | null {
  const errorEvent = events.find((e) => e.isError);
  if (!errorEvent) return null;

  const lines = errorEvent.text.split("\n");
  // split() on a string always returns at least one element, so lines[0]
  // is never undefined.
  const firstLine = lines[0];

  let normalized = firstLine
    .replace(/^Uncaught /, "")
    .replace(URL_PATTERN, (m) => urlToPath(m))
    .replace(QUOTED_STRING, '"…"')
    .replace(HEX_OR_UUID, "ID")
    .replace(NUMBER, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  for (const line of lines.slice(1)) {
    const match = STACK_FRAME.exec(line);
    if (match) {
      // Exactly one alternative of STACK_FRAME matches, so either group 1
      // or group 3 (and likewise 2 or 4) is always defined here.
      const fn = (match[1] ?? match[3])!;
      const file = (match[2] ?? match[4])!;
      normalized += ` @ ${fn.toLowerCase()} ${file.toLowerCase()}`;
      break;
    }
  }

  return normalized;
}
