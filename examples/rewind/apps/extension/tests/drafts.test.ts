import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSnapshots,
  deleteDraft,
  getDraft,
  listDrafts,
  pruneSnapshots,
  putDraft,
  putSnapshot,
  req,
  snapshotsFor,
  type Draft,
} from "../lib/drafts";

const blob = new Blob(["png"], { type: "image/png" });

function draft(id: string, createdAt: number): Draft {
  return {
    id,
    createdAt,
    url: "https://a.co/x",
    kind: "screenshot",
    blob,
    events: [],
  };
}

beforeEach(async () => {
  for (const d of await listDrafts()) await deleteDraft(d.id);
  await clearSnapshots();
});

describe("draft store", () => {
  it("puts and gets a draft", async () => {
    await putDraft(draft("d1", 1));
    const got = await getDraft("d1");
    expect(got).toMatchObject({ id: "d1", createdAt: 1, kind: "screenshot" });
    expect(got!.blob).toBeInstanceOf(Blob);
    expect(await got!.blob!.text()).toBe("png");
  });

  it("returns undefined for a missing draft", async () => {
    expect(await getDraft("missing")).toBeUndefined();
  });

  it("lists drafts newest first", async () => {
    await putDraft(draft("d1", 1));
    await putDraft(draft("d2", 2));
    expect((await listDrafts()).map((d) => d.id)).toEqual(["d2", "d1"]);
  });

  it("deletes a draft", async () => {
    await putDraft(draft("d1", 1));
    await deleteDraft("d1");
    expect(await getDraft("d1")).toBeUndefined();
  });
});

describe("req", () => {
  it("rejects when the request errors", async () => {
    const fakeRequest = {} as IDBRequest<string>;
    const promise = req(fakeRequest);
    const error = new Error("boom");
    Object.assign(fakeRequest, { error });
    fakeRequest.onerror!(new Event("error"));
    await expect(promise).rejects.toBe(error);
  });
});

describe("snapshot store", () => {
  it("stores and retrieves snapshots for a tab since a time", async () => {
    await putSnapshot({ tabId: 1, at: 10, blob });
    await putSnapshot({ tabId: 1, at: 20, blob });
    await putSnapshot({ tabId: 2, at: 15, blob });

    const forTab1 = await snapshotsFor(1, 15);
    expect(forTab1.map((s) => s.at)).toEqual([20]);
  });

  it("sorts results by time ascending", async () => {
    await putSnapshot({ tabId: 1, at: 30, blob });
    await putSnapshot({ tabId: 1, at: 10, blob });
    await putSnapshot({ tabId: 1, at: 20, blob });

    expect((await snapshotsFor(1, 0)).map((s) => s.at)).toEqual([10, 20, 30]);
  });

  it("prunes snapshots before a time", async () => {
    await putSnapshot({ tabId: 1, at: 10, blob });
    await putSnapshot({ tabId: 1, at: 20, blob });
    await pruneSnapshots(15);
    expect((await snapshotsFor(1, 0)).map((s) => s.at)).toEqual([20]);
  });

  it("clears every snapshot", async () => {
    await putSnapshot({ tabId: 1, at: 10, blob });
    await clearSnapshots();
    expect(await snapshotsFor(1, 0)).toEqual([]);
  });
});
