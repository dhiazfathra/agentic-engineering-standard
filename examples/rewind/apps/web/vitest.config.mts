import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { localEnv } from "./local-env";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves server-only to its empty build on the server; so do tests.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    env: { ...localEnv, DATABASE_URL: ":memory:" },
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // seed-cli.ts and backfill-signatures.ts are thin, untested-by-design
      // entry points: they only wire up a real db connection and call a
      // pure/tested function (seed(), errorSignature()).
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/db/seed-cli.ts",
        "src/db/backfill-signatures.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
