import type { Event } from "@rewind/schema";
import { eventKind } from "@rewind/schema";
import { z } from "zod";
import { storage } from "wxt/utils/storage";
import { trim } from "../buffer";
import type { CapturedEvent } from "../messages";
import type { Span } from "../timeline";
import { MAX_TEXT_LENGTH, toRewindEvents } from "../timeline";

// A page script can forge `window.postMessage({ source: "rewind", event })`,
// which the content script relays to `add` unvalidated. This is the trust
// boundary: every sender (content script, recorder, popup) routes through
// `add`, so validating here covers all of them. Reject anything that would
// break `toRewindEvents`/`createRewind.parse` downstream, or that could
// never actually age out of the buffer.
const MAX_CLOCK_SKEW_MS = 5000;
// `toRewindEvents` applies the same cap at flush; cut here too, at the trust
// boundary, so an oversized `text` never sits in `storage.session` (10 MB).

const capturedEventSchema = z.object({
  at: z.number().finite(),
  kind: eventKind,
  text: z.string(),
  isError: z.boolean(),
});

/** Validates an unknown value as a `CapturedEvent`, or returns `null` to drop it silently. */
export function parseCapturedEvent(value: unknown): CapturedEvent | null {
  const result = capturedEventSchema.safeParse(value);
  if (!result.success) return null;
  if (result.data.at > Date.now() + MAX_CLOCK_SKEW_MS) return null;
  return { ...result.data, text: result.data.text.slice(0, MAX_TEXT_LENGTH) };
}

type TabBuffers = Record<number, CapturedEvent[]>;

const SAVE_DELAY_MS = 1000;

const store = storage.defineItem<TabBuffers>("session:buffer", {
  fallback: {},
});

type Holds = Record<number, number>;

const holdsStore = storage.defineItem<Holds>("session:holds", {
  fallback: {},
});

// A restarted service worker re-populates this from `storage.session` on its
// first call; afterwards every read and write stays in memory, and saves are
// debounced so a burst of events costs one write.
let buffers: TabBuffers | undefined;
let loading: Promise<TabBuffers> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
// Holds are rare (recording start/stop) and must survive a worker restart
// immediately, so they're written through on every change instead of debounced.
let holds: Holds | undefined;
let loadingHolds: Promise<Holds> | undefined;

// Memoized so two concurrent first calls share one in-flight read instead of
// each awaiting `store.getValue()` separately: the second would otherwise
// overwrite `buffers` with the stale value it started with, discarding
// whatever the first caller's `add` already pushed into it.
async function load(): Promise<TabBuffers> {
  if (buffers) return buffers;
  loading ??= store.getValue().then((v) => (buffers = v));
  return loading;
}

async function loadHolds(): Promise<Holds> {
  if (holds) return holds;
  loadingHolds ??= holdsStore.getValue().then((v) => (holds = v));
  return loadingHolds;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    // Only called from `add`/`drop`, both of which call `load()` first.
    void store.setValue(buffers!);
  }, SAVE_DELAY_MS);
}

/** Adds an event to a tab's buffer, trimmed to the replay window/hold and the event cap. */
export async function add(
  tabId: number,
  capturedEvent: unknown,
): Promise<void> {
  const event = parseCapturedEvent(capturedEvent);
  if (!event) return;
  const all = await load();
  const tabHolds = await loadHolds();
  // No `await` between this read and the write below: two concurrent `add`s
  // on the same cold tab would otherwise both read the buffer as empty
  // before either writes, and the second write would drop the first event.
  const events = all[tabId] ?? [];
  all[tabId] = trim([...events, event], Date.now(), tabHolds[tabId] ?? null);
  scheduleSave();
}

/** A tab's raw buffered events, oldest first. */
export async function raw(tabId: number): Promise<CapturedEvent[]> {
  const all = await load();
  return all[tabId] ?? [];
}

/** The tab's buffered events, converted to `@rewind/schema` events over `spans`. */
export async function eventsFor(
  tabId: number,
  spans: Span[],
): Promise<Event[]> {
  return toRewindEvents(await raw(tabId), spans);
}

/** Holds the buffer from `since` (a recording started), or releases it with `null`. */
export async function hold(tabId: number, since: number | null): Promise<void> {
  const tabHolds = await loadHolds();
  if (since === null) delete tabHolds[tabId];
  else tabHolds[tabId] = since;
  await holdsStore.setValue(tabHolds);
}

/** Drops a tab's buffer, e.g. when the tab closes, unless a recording still holds it. */
export async function drop(tabId: number): Promise<void> {
  const tabHolds = await loadHolds();
  if (tabHolds[tabId] !== undefined) return;
  const all = await load();
  delete all[tabId];
  scheduleSave();
}

// ponytail: generous cap on how long a recording can run; if a hold is
// older than this, its recorder window is gone (crashed, or its release
// message never made it through), not still recording. Raise it if real
// recordings need to run longer.
export const MAX_RECORDING_MS = 2 * 60 * 60 * 1000;

/** Drops holds older than `MAX_RECORDING_MS`, e.g. one left by a recorder window that crashed or closed before it could release it. */
export async function clearStaleHolds(now = Date.now()): Promise<void> {
  const tabHolds = await loadHolds();
  for (const [tabId, since] of Object.entries(tabHolds)) {
    if (now - since > MAX_RECORDING_MS) delete tabHolds[Number(tabId)];
  }
  await holdsStore.setValue(tabHolds);
}
