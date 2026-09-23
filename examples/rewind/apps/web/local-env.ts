import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

// The committed local defaults, shared by the Vitest and Playwright configs.
// Both run from apps/web, which Playwright loads as CommonJS, so no import.meta.
export const localEnv = parseEnv(
  readFileSync(join(process.cwd(), "../../.env.example"), "utf8"),
) as Record<string, string>;
