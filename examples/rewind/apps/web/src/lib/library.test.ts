import { describe, expect, it } from "vitest";
import {
  boardColumns,
  filterByFolder,
  filterPalette,
  folderCounts,
  libraryReducer,
  nextFolderName,
  paletteItems,
  parseLibraryParams,
} from "./library";

describe("parseLibraryParams", () => {
  it("defaults to the grid view with no folder", () => {
    expect(parseLibraryParams({})).toEqual({ view: "grid" });
  });

  it("keeps a known view", () => {
    expect(parseLibraryParams({ view: "board" })).toEqual({ view: "board" });
  });

  it("falls back to grid on an unknown view", () => {
    expect(parseLibraryParams({ view: "bogus" })).toEqual({ view: "grid" });
  });

  it("falls back to grid when view is an array", () => {
    expect(parseLibraryParams({ view: ["grid", "list"] })).toEqual({
      view: "grid",
    });
  });

  it("carries a string folder", () => {
    expect(parseLibraryParams({ folder: "f1" })).toEqual({
      view: "grid",
      folder: "f1",
    });
  });

  it("ignores a non-string folder", () => {
    expect(parseLibraryParams({ folder: ["f1"] })).toEqual({ view: "grid" });
  });
});

describe("filterByFolder", () => {
  const rewinds = [
    { id: "r1", folderId: "f1" },
    { id: "r2", folderId: null },
    { id: "r3", folderId: "f2" },
  ];

  it("returns every rewind when folderId is undefined", () => {
    expect(filterByFolder(rewinds, undefined)).toBe(rewinds);
  });

  it("filters to one folder", () => {
    expect(filterByFolder(rewinds, "f1")).toEqual([rewinds[0]]);
  });

  it("returns nothing for an unknown folder", () => {
    expect(filterByFolder(rewinds, "missing")).toEqual([]);
  });
});

describe("folderCounts", () => {
  it("counts rewinds per folder and skips unfiled ones", () => {
    const rewinds = [
      { folderId: "f1" },
      { folderId: "f1" },
      { folderId: "f2" },
      { folderId: null },
    ];
    expect(folderCounts(rewinds)).toEqual({ f1: 2, f2: 1 });
  });

  it("returns an empty record with no rewinds", () => {
    expect(folderCounts([])).toEqual({});
  });
});

describe("boardColumns", () => {
  it("groups rewinds into the four status columns", () => {
    const rewinds = [
      { id: "r1", status: "new" as const },
      { id: "r2", status: "done" as const },
      { id: "r3", status: "new" as const },
    ];
    const columns = boardColumns(rewinds);
    expect(columns.map((c) => c.status)).toEqual([
      "new",
      "triage",
      "progress",
      "done",
    ]);
    expect(columns[0]!.label).toBe("New");
    expect(columns[0]!.rewinds).toEqual([rewinds[0], rewinds[2]]);
    expect(columns[1]!.rewinds).toEqual([]);
    expect(columns[3]!.rewinds).toEqual([rewinds[1]]);
  });
});

describe("nextFolderName", () => {
  it("starts at 1 with no untitled folders", () => {
    expect(nextFolderName([{ name: "Bugs" }])).toBe("Untitled folder 1");
  });

  it("picks one past the highest used number", () => {
    expect(
      nextFolderName([
        { name: "Untitled folder 1" },
        { name: "Untitled folder 3" },
        { name: "Bugs" },
      ]),
    ).toBe("Untitled folder 4");
  });

  it("ignores names that only look similar", () => {
    expect(nextFolderName([{ name: "Untitled folder" }])).toBe(
      "Untitled folder 1",
    );
  });
});

describe("paletteItems", () => {
  it("lists All Rewinds, folders, views, theme, then rewinds", () => {
    const items = paletteItems(
      [{ id: "r1", title: "Bug" }],
      [{ id: "f1", name: "Bugs" }],
      false,
    );
    expect(items[0]).toEqual({ kind: "all", label: "Go to All Rewinds" });
    expect(items[1]).toEqual({ kind: "folder", id: "f1", label: "Bugs" });
    expect(items.some((i) => i.kind === "view" && i.id === "grid")).toBe(true);
    expect(items.some((i) => i.kind === "view" && i.id === "list")).toBe(true);
    expect(items.some((i) => i.kind === "view" && i.id === "board")).toBe(true);
    expect(items).toContainEqual({
      kind: "theme",
      dark: true,
      label: "Switch to dark mode",
    });
    expect(items).toContainEqual({ kind: "rewind", id: "r1", label: "Bug" });
  });

  it("offers switching to light mode when dark is on", () => {
    const items = paletteItems([], [], true);
    expect(items).toContainEqual({
      kind: "theme",
      dark: false,
      label: "Switch to light mode",
    });
  });
});

describe("filterPalette", () => {
  const items = paletteItems(
    Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: `Bug ${i}` })),
    [],
    false,
  );

  it("returns every item, capped at 9, with an empty query", () => {
    expect(filterPalette(items, "").length).toBe(9);
  });

  it("matches case-insensitively on a substring", () => {
    const result = filterPalette(items, "go to all");
    expect(result).toEqual([{ kind: "all", label: "Go to All Rewinds" }]);
  });

  it("caps matches at 9", () => {
    expect(filterPalette(items, "bug").length).toBe(9);
  });
});

describe("libraryReducer", () => {
  const rewind = {
    id: "r1",
    title: "Bug",
    url: "https://x",
    reporterName: "A",
    status: "new" as const,
    kind: "screenshot" as const,
    mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
    durationSeconds: null,
    folderId: "f1" as string | null,
    recordingLinkId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    errorCount: 0,
  };
  const folder = { id: "f1", name: "Bugs", createdAt: new Date() };
  const state = { rewinds: [rewind], folders: [folder] };

  it("renames a rewind", () => {
    const next = libraryReducer(state, {
      type: "rename",
      id: "r1",
      title: "New title",
    });
    expect(next.rewinds[0]!.title).toBe("New title");
    expect(next.rewinds[0]).not.toBe(rewind);
  });

  it("leaves other rewinds alone on rename", () => {
    const other = { ...rewind, id: "r2" };
    const next = libraryReducer(
      { rewinds: [rewind, other], folders: [] },
      { type: "rename", id: "r1", title: "New" },
    );
    expect(next.rewinds[1]).toBe(other);
  });

  it("sets a rewind's status", () => {
    const next = libraryReducer(state, {
      type: "setStatus",
      id: "r1",
      status: "done",
    });
    expect(next.rewinds[0]!.status).toBe("done");
  });

  it("leaves other rewinds alone on setStatus", () => {
    const other = { ...rewind, id: "r2" };
    const next = libraryReducer(
      { rewinds: [rewind, other], folders: [] },
      { type: "setStatus", id: "r1", status: "done" },
    );
    expect(next.rewinds[1]).toBe(other);
  });

  it("sets a rewind's folder, including to none", () => {
    const next = libraryReducer(state, {
      type: "setFolder",
      id: "r1",
      folderId: null,
    });
    expect(next.rewinds[0]!.folderId).toBeNull();
  });

  it("leaves other rewinds alone on setFolder", () => {
    const other = { ...rewind, id: "r2" };
    const next = libraryReducer(
      { rewinds: [rewind, other], folders: [] },
      { type: "setFolder", id: "r1", folderId: null },
    );
    expect(next.rewinds[1]).toBe(other);
  });

  it("removes a rewind", () => {
    const next = libraryReducer(state, { type: "removeRewind", id: "r1" });
    expect(next.rewinds).toEqual([]);
  });

  it("restores a rewind", () => {
    const next = libraryReducer(
      { rewinds: [], folders: [] },
      { type: "restoreRewind", rewind },
    );
    expect(next.rewinds).toEqual([rewind]);
  });

  it("adds a folder", () => {
    const newFolder = {
      id: "f2",
      name: "Untitled folder 1",
      createdAt: new Date(),
    };
    const next = libraryReducer(state, {
      type: "addFolder",
      folder: newFolder,
    });
    expect(next.folders).toEqual([folder, newFolder]);
  });

  it("renames a folder", () => {
    const next = libraryReducer(state, {
      type: "renameFolder",
      id: "f1",
      name: "Renamed",
    });
    expect(next.folders[0]!.name).toBe("Renamed");
  });

  it("leaves other folders alone on renameFolder", () => {
    const other = { ...folder, id: "f2" };
    const next = libraryReducer(
      { rewinds: [], folders: [folder, other] },
      { type: "renameFolder", id: "f1", name: "Renamed" },
    );
    expect(next.folders[1]).toBe(other);
  });

  it("removes a folder and unfiles its rewinds", () => {
    const next = libraryReducer(state, { type: "removeFolder", id: "f1" });
    expect(next.folders).toEqual([]);
    expect(next.rewinds[0]!.folderId).toBeNull();
  });

  it("leaves rewinds in other folders alone on folder removal", () => {
    const other = { ...rewind, id: "r2", folderId: "f2" };
    const next = libraryReducer(
      { rewinds: [rewind, other], folders: [folder] },
      { type: "removeFolder", id: "f1" },
    );
    expect(next.rewinds[1]).toBe(other);
  });

  it("restores a folder and re-files its rewinds", () => {
    const unfiled = { ...rewind, folderId: null };
    const next = libraryReducer(
      { rewinds: [unfiled], folders: [] },
      { type: "restoreFolder", folder, rewindIds: ["r1"] },
    );
    expect(next.folders).toEqual([folder]);
    expect(next.rewinds[0]!.folderId).toBe("f1");
  });

  it("leaves rewinds not in the restore list alone", () => {
    const other = { ...rewind, id: "r2", folderId: null };
    const next = libraryReducer(
      { rewinds: [other], folders: [] },
      { type: "restoreFolder", folder, rewindIds: ["r1"] },
    );
    expect(next.rewinds[0]).toBe(other);
  });
});
