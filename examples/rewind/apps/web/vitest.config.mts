import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    // Local defaults from .env.example, so modules that read env at import load.
    env: {
      DATABASE_URL: ":memory:",
      S3_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "rewind",
      S3_ACCESS_KEY: "rewind",
      S3_SECRET_KEY: "rewind-local-secret",
    },
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
