// No `server-only` import: unlike lib/auth.ts, this is used from
// db/seed.ts, which runs under bun directly (seed-cli.ts) as well as under
// Next's server build — `server-only`'s guard throws outside a bundler.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
