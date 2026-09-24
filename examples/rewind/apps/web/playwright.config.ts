import { defineConfig } from "@playwright/test";
import { localEnv } from "./local-env";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // Fresh DB each run: delete a stale e2e.db, migrate, then build+start.
    command: `rm -f e2e.db && drizzle-kit migrate && bun src/db/seed-cli.ts && next build && next start -p ${port}`,
    url: `http://localhost:${port}`,
    env: {
      ...localEnv,
      DATABASE_URL: "file:e2e.db",
      // Let a real S3_ENDPOINT (e.g. a port-remapped MinIO) override the
      // .env.example default, without changing that default.
      ...(process.env.S3_ENDPOINT
        ? { S3_ENDPOINT: process.env.S3_ENDPOINT }
        : {}),
    },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
