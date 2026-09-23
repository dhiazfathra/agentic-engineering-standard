import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { contentTypeToExtension, newId, uploadRequest } from "@rewind/schema";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/http";
import { s3 } from "@/lib/storage";

export async function POST(req: Request) {
  const parsed = await parseBody(req, uploadRequest);
  if (parsed instanceof NextResponse) return parsed;

  const ext =
    contentTypeToExtension[
      parsed.contentType as keyof typeof contentTypeToExtension
    ];
  const key = `rewinds/${newId()}.${ext}`;
  // debt: a presigned PUT cannot cap size; switch to a presigned POST policy
  // with content-length-range when uploads are public.
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: parsed.contentType,
    }),
    { expiresIn: 900, signableHeaders: new Set(["content-type"]) },
  );

  return NextResponse.json({ url, key });
}
