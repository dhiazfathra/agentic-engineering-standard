import { defineConfig } from "@playwright/test";
import { localEnv } from "./local-env";
import { STORAGE_STATE_PATH } from "./e2e/auth";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://localhost:${port}` },
  // auth.spec.ts covers the unauthenticated/login/signup/logout flows
  // itself, so it runs with no stored session; every other spec runs
  // logged in via storageState, saved once by the "setup" project below.
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "authenticated",
      testIgnore: /auth\.spec\.ts|auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { storageState: STORAGE_STATE_PATH },
    },
    { name: "unauthenticated", testMatch: /auth\.spec\.ts/ },
  ],
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
