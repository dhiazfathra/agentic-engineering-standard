import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // WXT reads every file in entrypoints/ as an entrypoint, so tests live in tests/.
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["fake-indexeddb/auto"],
    coverage: {
      provider: "v8",
      include: ["entrypoints/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      exclude: [
        // DOM bootstrap only; the popup/recorder e2e proves it mounts.
        "entrypoints/popup/main.tsx",
        "entrypoints/recorder/main.tsx",
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
