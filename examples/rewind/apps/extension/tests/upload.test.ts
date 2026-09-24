import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTitle, fileDraft, type FileDraftArgs } from "../lib/upload";

function rewind(
  overrides: Partial<FileDraftArgs["rewind"]> = {},
): FileDraftArgs["rewind"] {
  return {
    title: "Screenshot of a.co/x",
    url: "https://a.co/x",
    reporterName: "Ada",
    status: "new",
    kind: "screenshot",
    events: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultTitle", () => {
  it("names a screenshot", () => {
    expect(defaultTitle("screenshot", "https://a.co/x?y=1")).toBe(
      "Screenshot of a.co/x",
    );
  });

  it("names a recording", () => {
    expect(defaultTitle("video", "https://a.co/x")).toBe("Recording of a.co/x");
  });

  it("cuts a long path to the 200-character title limit", () => {
    expect(
      defaultTitle("screenshot", `https://a.co/${"p".repeat(300)}`),
    ).toHaveLength(200);
  });

  it("falls back to a plain verb instead of throwing on an invalid url", () => {
    expect(defaultTitle("screenshot", "")).toBe("Screenshot");
    expect(defaultTitle("video", "not-a-url")).toBe("Recording");
  });
});

function okFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: "https://minio/put-url",
        key: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
      }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "r1" }) });
}

describe("fileDraft", () => {
  it("builds the viewer link against an app URL with a trailing slash", async () => {
    vi.stubGlobal("fetch", okFetch());
    const result = await fileDraft({
      appUrl: "https://a.co/",
      blob: new Blob(["x"]),
      contentType: "image/png",
      rewind: rewind(),
    });
    expect(result.viewerUrl).toBe("https://a.co/r/r1");
  });

  it("drops the hash and cuts the page URL to the 2048-character limit", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await fileDraft({
      appUrl: "https://a.co",
      blob: new Blob(["x"]),
      contentType: "image/png",
      rewind: rewind({ url: `https://a.co/x?q=${"a".repeat(3000)}#frag` }),
    });
    const body = JSON.parse(fetchMock.mock.calls[2]![1].body);
    expect(body.url).toHaveLength(2048);
    expect(body.url).not.toContain("#");
  });

  it("throws on an invalid rewind before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fileDraft({
        appUrl: "https://a.co",
        blob: new Blob(["x"]),
        contentType: "image/png",
        rewind: rewind({ title: "" }),
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes the three calls and sends the exact Content-Type on the PUT", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://minio/put-url",
          key: "rewinds/aaaaaaaaaaaaaaaaaaaaa.png",
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "r1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fileDraft({
      appUrl: "https://a.co",
      blob: new Blob(["x"]),
      contentType: "image/png",
      rewind: rewind(),
    });

    expect(result).toEqual({ id: "r1", viewerUrl: "https://a.co/r/r1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0]!;
    expect(String(uploadUrl)).toBe("https://a.co/api/uploads");
    expect(JSON.parse(uploadInit.body)).toEqual({ contentType: "image/png" });
    expect(String(fetchMock.mock.calls[2]![0])).toBe(
      "https://a.co/api/rewinds",
    );
    const putCall = fetchMock.mock.calls[1]!;
    expect(putCall[0]).toBe("https://minio/put-url");
    expect(putCall[1].headers).toEqual({ "Content-Type": "image/png" });
    const createCall = fetchMock.mock.calls[2]!;
    const body = JSON.parse(createCall[1].body as string);
    expect(body.mediaKey).toBe("rewinds/aaaaaaaaaaaaaaaaaaaaa.png");
  });

  it("throws naming the step and status on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fileDraft({
        appUrl: "https://a.co",
        blob: new Blob(["x"]),
        contentType: "image/png",
        rewind: rewind(),
      }),
    ).rejects.toThrow(/POST \/api\/uploads failed: 500/);
  });
});
