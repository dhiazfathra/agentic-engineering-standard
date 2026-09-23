import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { s3 } from "@/lib/storage";

// Probe on every request, never at build time.
export const dynamic = "force-dynamic";

const probe = (p: Promise<unknown>) =>
  p.then(
    () => "ok" as const,
    () => "unreachable" as const,
  );

export async function GET() {
  const [database, storage] = await Promise.all([
    probe(db.run(sql`select 1`)),
    probe(s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))),
  ]);
  const ok = database === "ok" && storage === "ok";
  return Response.json({ database, storage }, { status: ok ? 200 : 503 });
}
