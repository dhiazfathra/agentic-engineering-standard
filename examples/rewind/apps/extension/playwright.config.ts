import { defineConfig } from "@playwright/test";
import { localEnv } from "../web/local-env";

// The web app the extension files Rewinds to, on its own port and DB so it
// never collides with apps/web's own e2e run.
const WEB_PORT = 3200;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Each test drives fake media capture in its own extension context; running
  // them concurrently starves the CPU and makes capture timing flaky.
  workers: 1,
  webServer: {
    // `bun run` (not a bare binary) so it augments PATH with ../web's own
    // node_modules/.bin, regardless of which package this config was invoked from.
    command: `rm -f ext-e2e.db && bun run db:migrate && bun run db:seed && bun run build && bun run start -- -p ${WEB_PORT}`,
    cwd: "../web",
    url: WEB_URL,
    env: {
      ...localEnv,
      DATABASE_URL: "file:ext-e2e.db",
      ...(process.env.S3_ENDPOINT
        ? { S3_ENDPOINT: process.env.S3_ENDPOINT }
        : {}),
    },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
