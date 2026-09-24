import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
