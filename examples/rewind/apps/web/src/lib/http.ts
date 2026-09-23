import { NextResponse } from "next/server";
import type { z } from "zod";

// libsql's extended SQLite result codes.
// https://www.sqlite.org/rescode.html#constraint_foreignkey
// https://www.sqlite.org/rescode.html#constraint_unique
const SQLITE_CONSTRAINT_FOREIGNKEY = "SQLITE_CONSTRAINT_FOREIGNKEY";
const SQLITE_CONSTRAINT_UNIQUE = "SQLITE_CONSTRAINT_UNIQUE";

function hasExtendedCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "extendedCode" in error &&
    error.extendedCode === code
  );
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasExtendedCode(error, SQLITE_CONSTRAINT_FOREIGNKEY);
}

export function isUniqueViolation(error: unknown): boolean {
  return hasExtendedCode(error, SQLITE_CONSTRAINT_UNIQUE);
}

/**
 * Parses a request body with a zod schema. Returns the parsed data, or a
 * 400 NextResponse (invalid JSON or a zod failure) for the route to
 * return as-is.
 */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T | NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return parsed.data;
}
