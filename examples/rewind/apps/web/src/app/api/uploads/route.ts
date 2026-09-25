import { NextResponse } from "next/server";
import { contentTypeToExtension, newId, uploadRequest } from "@rewind/schema";
import { parseBody } from "@/lib/http";
import { presignPut } from "@/lib/storage";

// Public: `/rec/[id]`'s anonymous recorder needs this with no session, the
// same way the extension's session-carrying fetch does. The key is a
// random nanoid unrelated to any workspace, so a presigned PUT to it grants
// no more than "upload one object of an allowed content type" either way.
export async function POST(req: Request) {
  const parsed = await parseBody(req, uploadRequest);
  if (parsed instanceof NextResponse) return parsed;

  const ext =
    contentTypeToExtension[
      parsed.contentType as keyof typeof contentTypeToExtension
    ];
  const key = `rewinds/${newId()}.${ext}`;
  const url = await presignPut(key, parsed.contentType);

  return NextResponse.json({ url, key });
}
