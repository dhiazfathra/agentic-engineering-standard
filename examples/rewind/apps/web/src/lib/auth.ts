import "server-only";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { memberships, sessions, users, workspaces } from "@/db/schema";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "rw_session";
// Non-HttpOnly: client JS reads it to show "Continue as <email>" on /login.
export const EMAIL_COOKIE = "rw_last_email";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_CODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** scrypt with a random salt, stored as `<salt hex>:<hash hex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** SHA-256 hex digest — used to store session and access-token secrets. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** 11-character invite code, matching the seed's fixed-width format. */
export function generateInviteCode(): string {
  const bytes = randomBytes(11);
  return Array.from(bytes, (b) => INVITE_CODE_ALPHABET[b % 62]).join("");
}

export async function createSession(
  userId: string,
  workspaceId: string,
): Promise<string> {
  const token = generateToken();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    workspaceId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Remembers the email for the "Continue as <email>" affordance on /login. */
export function setEmailCookie(res: NextResponse, email: string): void {
  res.cookies.set(EMAIL_COOKIE, email, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export type Session = {
  user: typeof users.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
  membership: typeof memberships.$inferSelect;
};

async function sessionForToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, hashToken(token)),
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;

  const [user, workspace, membership] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, row.userId) }),
    db.query.workspaces.findFirst({ where: eq(workspaces.id, row.workspaceId) }),
    db.query.memberships.findFirst({
      where: and(
        eq(memberships.workspaceId, row.workspaceId),
        eq(memberships.userId, row.userId),
      ),
    }),
  ]);
  if (!user || !workspace || !membership) return null;
  return { user, workspace, membership };
}

/** The session for the `rw_session` cookie on `req`, or null if absent/invalid/expired. */
export async function getSession(req: Request): Promise<Session | null> {
  return sessionForToken(readCookie(req, SESSION_COOKIE));
}

/**
 * Same as `getSession`, for server components and pages, which read cookies
 * through `next/headers` rather than a `Request`.
 */
export async function getPageSession(): Promise<Session | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return sessionForToken(store.get(SESSION_COOKIE)?.value);
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Reads the session for `req`, or a 401 NextResponse for the route to return as-is. */
export async function requireSession(
  req: Request,
): Promise<Session | NextResponse> {
  const session = await getSession(req);
  if (!session) return unauthorized();
  return session;
}

/** Admin gate for an already-loaded session; a 403 NextResponse or null (allowed). */
export function requireAdmin(session: Session): NextResponse | null {
  return session.membership.role === "Admin" ? null : forbidden();
}

/** A user row with passwordHash stripped, safe to return from an API route. */
export function publicUser(user: typeof users.$inferSelect) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
