import { asc, eq } from "drizzle-orm";
import { comments, events, rewinds } from "@/db/schema";
import { db } from "@/lib/db";

/** The row shape shared by `GET /api/rewinds/[id]` and the viewer page. */
export async function getRewind(id: string) {
  return db.query.rewinds.findFirst({
    where: eq(rewinds.id, id),
    with: {
      events: { orderBy: asc(events.t) },
      comments: { orderBy: asc(comments.t) },
    },
  });
}

export type RewindDetail = NonNullable<Awaited<ReturnType<typeof getRewind>>>;
