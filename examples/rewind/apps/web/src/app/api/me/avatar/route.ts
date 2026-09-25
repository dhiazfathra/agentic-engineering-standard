import { NextResponse } from "next/server";
import {
  contentTypeToImageExtension,
  imageUploadRequest,
  newId,
} from "@rewind/schema";
import { requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { presignPut } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Presigns an avatar upload for the session's own user. Persist the
 * resulting key with `PATCH /api/me { avatarKey }` after the PUT succeeds.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const parsed = await parseBody(req, imageUploadRequest);
  if (parsed instanceof NextResponse) return parsed;

  const ext =
    contentTypeToImageExtension[
      parsed.contentType as keyof typeof contentTypeToImageExtension
    ];
  const key = `avatars/${newId()}.${ext}`;
  const url = await presignPut(key, parsed.contentType);

  return NextResponse.json({ url, key });
}
