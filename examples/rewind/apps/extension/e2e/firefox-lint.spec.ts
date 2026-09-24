import { spawnSync } from "node:child_process";
import { test } from "@playwright/test";

test("the Firefox build passes web-ext lint", () => {
  const result = spawnSync(
    "bunx",
    ["web-ext", "lint", "-s", ".output/firefox-mv3"],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `web-ext lint failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
});
