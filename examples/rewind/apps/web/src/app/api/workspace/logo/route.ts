import { NextResponse } from "next/server";
import {
  contentTypeToImageExtension,
  imageUploadRequest,
  newId,
} from "@rewind/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import { parseBody } from "@/lib/http";
import { presignPut } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Presigns a workspace logo upload, Admin only. Persist the resulting key
 * with `PATCH /api/workspace { logoKey }` after the PUT succeeds.
 */
export async function PATCH(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireAdmin(session);
  if (forbidden) return forbidden;

  const parsed = await parseBody(req, imageUploadRequest);
  if (parsed instanceof NextResponse) return parsed;

  const ext =
    contentTypeToImageExtension[
      parsed.contentType as keyof typeof contentTypeToImageExtension
    ];
  const key = `logos/${newId()}.${ext}`;
  const url = await presignPut(key, parsed.contentType);

  return NextResponse.json({ url, key });
}
