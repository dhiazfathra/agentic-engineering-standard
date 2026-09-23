import { describe, expect, it } from "vitest";
import {
  contentTypeToExtension,
  createComment,
  createFolder,
  createRecordingLink,
  createRewind,
  event,
  eventKind,
  mediaKeyPattern,
  newId,
  rewindKind,
  rewindStatus,
  updateFolder,
  updateRewind,
  uploadRequest,
} from "./index";

describe("newId", () => {
  it("generates a 21-char id from the allowed alphabet", () => {
    const id = newId();
    expect(id).toHaveLength(21);
    expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });
});

describe("mediaKeyPattern", () => {
  const id = "a".repeat(21);
  it.each(["webm", "mp4", "png", "jpg"])("accepts .%s", (ext) => {
    expect(mediaKeyPattern.test(`rewinds/${id}.${ext}`)).toBe(true);
  });

  it("rejects a short id", () => {
    expect(mediaKeyPattern.test("rewinds/short.png")).toBe(false);
  });

  it("rejects a bad extension", () => {
    expect(mediaKeyPattern.test(`rewinds/${id}.gif`)).toBe(false);
  });

  it("rejects a missing prefix", () => {
    expect(mediaKeyPattern.test(`${id}.png`)).toBe(false);
  });
});

describe("contentTypeToExtension", () => {
  it("maps every allowed content type", () => {
    expect(contentTypeToExtension).toEqual({
      "video/webm": "webm",
      "video/mp4": "mp4",
      "image/png": "png",
      "image/jpeg": "jpg",
    });
  });
});

describe("rewindStatus", () => {
  it("accepts each status", () => {
    for (const s of ["new", "triage", "progress", "done"]) {
      expect(rewindStatus.safeParse(s).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(rewindStatus.safeParse("archived").success).toBe(false);
  });
});

describe("rewindKind", () => {
  it("accepts video and screenshot", () => {
    expect(rewindKind.safeParse("video").success).toBe(true);
    expect(rewindKind.safeParse("screenshot").success).toBe(true);
  });

  it("rejects anything else", () => {
    expect(rewindKind.safeParse("audio").success).toBe(false);
  });
});

describe("eventKind", () => {
  it("accepts each kind", () => {
    for (const k of ["nav", "click", "input", "net", "log", "warn", "err"]) {
      expect(eventKind.safeParse(k).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(eventKind.safeParse("other").success).toBe(false);
  });
});

describe("uploadRequest", () => {
  it("accepts an allowed content type", () => {
    expect(uploadRequest.safeParse({ contentType: "video/webm" }).success).toBe(
      true,
    );
  });

  it("rejects a disallowed content type", () => {
    expect(
      uploadRequest.safeParse({ contentType: "application/pdf" }).success,
    ).toBe(false);
  });
});

describe("event", () => {
  it("accepts a full event", () => {
    expect(
      event.safeParse({ t: 1, kind: "log", text: "hi", isError: true }).success,
    ).toBe(true);
  });

  it("defaults isError to false", () => {
    const parsed = event.safeParse({ t: 0, kind: "nav", text: "hi" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isError).toBe(false);
  });

  it("rejects a negative t", () => {
    expect(event.safeParse({ t: -1, kind: "nav", text: "hi" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown kind", () => {
    expect(event.safeParse({ t: 0, kind: "bogus", text: "hi" }).success).toBe(
      false,
    );
  });
});

const validMediaKey = (ext: string) => `rewinds/${"a".repeat(21)}.${ext}`;

const baseVideo = {
  title: "Bug",
  url: "https://example.com",
  reporterName: "Sam",
  kind: "video" as const,
  mediaKey: validMediaKey("webm"),
  durationSeconds: 12,
};

describe("createRewind", () => {
  it("accepts a valid video with duration", () => {
    expect(createRewind.safeParse(baseVideo).success).toBe(true);
  });

  it("defaults status to new and events to []", () => {
    const parsed = createRewind.safeParse(baseVideo);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("new");
      expect(parsed.data.events).toEqual([]);
    }
  });

  it("accepts a valid screenshot without duration", () => {
    expect(
      createRewind.safeParse({
        ...baseVideo,
        kind: "screenshot",
        mediaKey: validMediaKey("png"),
        durationSeconds: undefined,
      }).success,
    ).toBe(true);
  });

  it("rejects a screenshot with a duration", () => {
    expect(
      createRewind.safeParse({
        ...baseVideo,
        kind: "screenshot",
        mediaKey: validMediaKey("png"),
        durationSeconds: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects a video without a duration", () => {
    expect(
      createRewind.safeParse({
        ...baseVideo,
        durationSeconds: undefined,
      }).success,
    ).toBe(false);
  });

  it("rejects a mediaKey that doesn't match mediaKeyPattern", () => {
    expect(
      createRewind.safeParse({ ...baseVideo, mediaKey: "not/a/key.png" })
        .success,
    ).toBe(false);
  });

  it("rejects a title over 200 chars", () => {
    expect(
      createRewind.safeParse({ ...baseVideo, title: "a".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(createRewind.safeParse({ ...baseVideo, title: "" }).success).toBe(
      false,
    );
  });

  it("accepts nullable folderId, recordingLinkId, and events", () => {
    const parsed = createRewind.safeParse({
      ...baseVideo,
      folderId: null,
      recordingLinkId: null,
      events: [{ t: 0, kind: "log", text: "hi" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("updateRewind", () => {
  it("accepts a single field", () => {
    expect(updateRewind.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("accepts a null folderId", () => {
    expect(updateRewind.safeParse({ folderId: null }).success).toBe(true);
  });

  it("rejects an empty object", () => {
    expect(updateRewind.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown field (strict)", () => {
    expect(updateRewind.safeParse({ title: "x", bogus: 1 }).success).toBe(
      false,
    );
  });
});

describe("createComment", () => {
  const base = { t: 1, x: 50, y: 50, author: "Sam", text: "hi" };

  it("accepts a valid comment", () => {
    expect(createComment.safeParse(base).success).toBe(true);
  });

  it("rejects x out of range", () => {
    expect(createComment.safeParse({ ...base, x: 101 }).success).toBe(false);
  });

  it("rejects y out of range", () => {
    expect(createComment.safeParse({ ...base, y: -1 }).success).toBe(false);
  });

  it("rejects a negative t", () => {
    expect(createComment.safeParse({ ...base, t: -1 }).success).toBe(false);
  });

  it("rejects an empty author", () => {
    expect(createComment.safeParse({ ...base, author: "" }).success).toBe(
      false,
    );
  });

  it("rejects empty text", () => {
    expect(createComment.safeParse({ ...base, text: "" }).success).toBe(false);
  });
});

describe("createFolder / updateFolder", () => {
  it("accepts a valid name", () => {
    expect(createFolder.safeParse({ name: "Bugs" }).success).toBe(true);
    expect(updateFolder.safeParse({ name: "Bugs" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createFolder.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(createFolder.safeParse({ name: "a".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("createRecordingLink", () => {
  it("accepts a valid name", () => {
    expect(createRecordingLink.safeParse({ name: "Sprint demo" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(createRecordingLink.safeParse({ name: "" }).success).toBe(false);
  });
});
