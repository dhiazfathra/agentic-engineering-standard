import type { Event } from "@rewind/schema";
import { storage } from "wxt/utils/storage";
import { trim } from "../buffer";
import type { CapturedEvent } from "../messages";
import type { Span } from "../timeline";
import { toRewindEvents } from "../timeline";

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
let saveTimer: ReturnType<typeof setTimeout> | undefined;
// Holds are rare (recording start/stop) and must survive a worker restart
// immediately, so they're written through on every change instead of debounced.
let holds: Holds | undefined;

async function load(): Promise<TabBuffers> {
  buffers ??= await store.getValue();
  return buffers;
}

async function loadHolds(): Promise<Holds> {
  holds ??= await holdsStore.getValue();
  return holds;
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
  capturedEvent: CapturedEvent,
): Promise<void> {
  const all = await load();
  const events = all[tabId] ?? [];
  const tabHolds = await loadHolds();
  all[tabId] = trim(
    [...events, capturedEvent],
    Date.now(),
    tabHolds[tabId] ?? null,
  );
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

/** Drops a tab's buffer, e.g. when the tab closes. */
export async function drop(tabId: number): Promise<void> {
  const all = await load();
  delete all[tabId];
  const tabHolds = await loadHolds();
  delete tabHolds[tabId];
  await holdsStore.setValue(tabHolds);
  scheduleSave();
}
