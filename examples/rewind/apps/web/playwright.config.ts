import { defineConfig } from "@playwright/test";
import { localEnv } from "./local-env";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `next build && next start -p ${port}`,
    url: `http://localhost:${port}`,
    env: { ...localEnv, DATABASE_URL: "file:e2e.db" },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
