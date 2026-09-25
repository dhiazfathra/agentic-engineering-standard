import "server-only";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  // MinIO ignores the region, but the SDK needs one to sign.
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

/**
 * A presigned GET URL for a media object, 1-hour TTL. Signing is local, so
 * it works on Vercel against the local MinIO the same way uploads do; the
 * server never checks the object exists.
 */
export function mediaUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
}

/**
 * A presigned PUT URL for a new object, 15-minute TTL. Shared by
 * /api/uploads, /api/me/avatar and /api/workspace/logo.
 * debt: a presigned PUT cannot cap size; switch to a presigned POST policy
 * with content-length-range when uploads are public.
 */
export function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 900, signableHeaders: new Set(["content-type"]) },
  );
}
