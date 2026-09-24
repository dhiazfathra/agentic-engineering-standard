import type { Event } from "@rewind/schema";

export type Draft = {
  id: string;
  createdAt: number;
  url: string; // the page, http(s)
  kind: "screenshot" | "video" | "replay";
  blob?: Blob; // image/png or video/webm
  frames?: { at: number; blob: Blob }[]; // replay, until the editor encodes it
  durationSeconds?: number;
  events: Event[]; // @rewind/schema Event, t already in media seconds
};

export type Snapshot = { id?: number; tabId: number; at: number; blob: Blob };

const DB_NAME = "rewind";
const DB_VERSION = 1;
const CAPTURES = "captures";
const SNAPSHOTS = "snapshots";

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore(CAPTURES, { keyPath: "id" });
        db.createObjectStore(SNAPSHOTS, {
          keyPath: "id",
          autoIncrement: true,
        }).createIndex("at", "at");
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  return dbPromise;
}

async function store(
  name: string,
  mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function putDraft(draft: Draft): Promise<void> {
  const s = await store(CAPTURES, "readwrite");
  await req(s.put(draft));
}

export async function getDraft(id: string): Promise<Draft | undefined> {
  const s = await store(CAPTURES, "readonly");
  return req(s.get(id));
}

export async function listDrafts(): Promise<Draft[]> {
  const s = await store(CAPTURES, "readonly");
  const all = await req(s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDraft(id: string): Promise<void> {
  const s = await store(CAPTURES, "readwrite");
  await req(s.delete(id));
}

export async function putSnapshot(
  snapshot: Omit<Snapshot, "id">,
): Promise<void> {
  const s = await store(SNAPSHOTS, "readwrite");
  await req(s.put(snapshot));
}

export async function snapshotsFor(
  tabId: number,
  since: number,
): Promise<Snapshot[]> {
  const s = await store(SNAPSHOTS, "readonly");
  const all = await req(s.getAll());
  return all
    .filter((snap) => snap.tabId === tabId && snap.at >= since)
    .sort((a, b) => a.at - b.at);
}

export async function pruneSnapshots(before: number): Promise<void> {
  const s = await store(SNAPSHOTS, "readwrite");
  const range = IDBKeyRange.upperBound(before, true);
  const keys = await req(s.index("at").getAllKeys(range));
  for (const key of keys) await req(s.delete(key));
}

export async function clearSnapshots(): Promise<void> {
  const s = await store(SNAPSHOTS, "readwrite");
  await req(s.clear());
}
