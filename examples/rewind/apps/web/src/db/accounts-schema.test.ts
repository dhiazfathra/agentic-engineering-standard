// Drives inserts against a real migrated temp database to prove the new
// accounts/workspaces tables and their column defaults are wired correctly.
// Auth logic (hashing, sessions) lands in a later chunk; this only proves
// the schema and migration.
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dbFile = join(mkdtempSync(join(tmpdir(), "rewind-accounts-")), "test.db");
vi.stubEnv("DATABASE_URL", `file:${dbFile}`);

const { db } = await import("@/lib/db");
const {
  users,
  workspaces,
  memberships,
  invites,
  sessions,
  accessTokens,
  integrations,
  supportMessages,
  folders,
  rewinds,
  DEFAULT_WORKSPACE_ID,
} = await import("./schema");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("accounts + workspaces schema", () => {
  it("backfills the default workspace created by the migration", async () => {
    const row = await db.query.workspaces.findFirst({
      where: (w, { eq }) => eq(w.id, DEFAULT_WORKSPACE_ID),
    });
    expect(row?.defaultLinkAccess).toBe("anyone");
  });

  it("applies user, workspace, and membership defaults on insert", async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: "a@example.com",
        passwordHash: "hash",
        firstName: "A",
        lastName: "B",
      })
      .returning();
    expect(user.role).toBe("Engineering");
    expect(user.theme).toBe("light");
    expect(user.notifyN1).toBe(true);

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Acme", inviteCode: "abc123" })
      .returning();
    expect(workspace.defaultLinkAccess).toBe("members");
    expect(workspace.groupDuplicates).toBe(true);

    const [membership] = await db
      .insert(memberships)
      .values({ workspaceId: workspace.id, userId: user.id, role: "Admin" })
      .returning();
    expect(membership.role).toBe("Admin");

    const [invite] = await db
      .insert(invites)
      .values({ workspaceId: workspace.id, email: "b@example.com" })
      .returning();
    expect(invite.role).toBe("Viewer");

    const [session] = await db
      .insert(sessions)
      .values({
        id: "session-hash",
        userId: user.id,
        workspaceId: workspace.id,
        expiresAt: new Date(Date.now() + 1000),
      })
      .returning();
    expect(session.id).toBe("session-hash");

    const [token] = await db
      .insert(accessTokens)
      .values({ userId: user.id, name: "CLI", tokenHash: "hash" })
      .returning();
    expect(token.id).toBeTruthy();

    const [integration] = await db
      .insert(integrations)
      .values({ workspaceId: workspace.id, name: "linear" })
      .returning();
    expect(integration.name).toBe("linear");

    const [message] = await db
      .insert(supportMessages)
      .values({ userId: user.id, text: "help" })
      .returning();
    expect(message.text).toBe("help");
  });

  it("scopes folders and rewinds to the default workspace by default", async () => {
    const [folder] = await db
      .insert(folders)
      .values({ name: "Bugs" })
      .returning();
    expect(folder.workspaceId).toBe(DEFAULT_WORKSPACE_ID);

    const [rewind] = await db
      .insert(rewinds)
      .values({
        title: "T",
        url: "https://x.com",
        reporterName: "R",
        kind: "video",
        mediaKey: "rewinds/aaaaaaaaaaaaaaaaaaaaa.webm",
      })
      .returning();
    expect(rewind.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(rewind.errorSignature).toBeNull();
  });
});
