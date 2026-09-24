import {
  contentTypeToExtension,
  createRewind,
  type CreateRewind,
} from "@rewind/schema";

export type FileDraftArgs = {
  appUrl: string;
  blob: Blob;
  contentType: keyof typeof contentTypeToExtension;
  rewind: Omit<CreateRewind, "mediaKey">;
};

export type FileDraftResult = { id: string; viewerUrl: string };

export const TITLE_MAX = createRewind.shape.title.maxLength!;
const URL_MAX = createRewind.shape.url.maxLength!;

/** `Screenshot of host/path` or `Recording of host/path`, cut to the title limit. */
export function defaultTitle(
  kind: "screenshot" | "video" | "replay",
  url: string,
): string {
  const u = new URL(url);
  const verb = kind === "screenshot" ? "Screenshot" : "Recording";
  return `${verb} of ${u.host}${u.pathname}`.slice(0, TITLE_MAX);
}

async function checkOk(res: Response, step: string): Promise<void> {
  if (!res.ok) {
    throw new Error(`${step} failed: ${res.status}`);
  }
}

// A placeholder that satisfies mediaKeyPattern, only to validate every other
// field before the real key comes back from POST /api/uploads.
function placeholderKey(contentType: keyof typeof contentTypeToExtension) {
  return `rewinds/${"a".repeat(21)}.${contentTypeToExtension[contentType]}`;
}

/**
 * Uploads a draft: `POST /api/uploads`, `PUT` the blob with the exact
 * signed `Content-Type`, then `POST /api/rewinds`.
 */
export async function fileDraft({
  appUrl,
  blob,
  contentType,
  rewind: draft,
}: FileDraftArgs): Promise<FileDraftResult> {
  const pageUrl = new URL(draft.url);
  pageUrl.hash = "";
  const rewind = { ...draft, url: pageUrl.href.slice(0, URL_MAX) };
  // Validate before any network call, so a bad body never reaches fetch.
  createRewind.parse({ ...rewind, mediaKey: placeholderKey(contentType) });

  const uploadRes = await fetch(new URL("/api/uploads", appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  await checkOk(uploadRes, "POST /api/uploads");
  const { url, key } = (await uploadRes.json()) as {
    url: string;
    key: string;
  };

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  await checkOk(putRes, "PUT upload");

  const body = createRewind.parse({ ...rewind, mediaKey: key });
  const createRes = await fetch(new URL("/api/rewinds", appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await checkOk(createRes, "POST /api/rewinds");
  const created = (await createRes.json()) as { id: string };

  return {
    id: created.id,
    viewerUrl: new URL(`/r/${created.id}`, appUrl).href,
  };
}
