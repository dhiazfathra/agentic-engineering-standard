import { eq } from "drizzle-orm";
import { integrations } from "@/db/schema";
import { db } from "@/lib/db";

export {
  INTEGRATION_CATALOG,
  INTEGRATION_IDS,
  type IntegrationDef,
} from "@/lib/integrations-catalog";

/** Names of integrations `workspaceId` has connected. */
export async function listIntegrations(workspaceId: string): Promise<string[]> {
  const rows = await db.query.integrations.findMany({
    where: eq(integrations.workspaceId, workspaceId),
  });
  return rows.map((r) => r.name);
}
