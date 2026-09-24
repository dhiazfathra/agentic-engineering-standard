import { expect, it } from "vitest";
import { getDraft } from "../lib/drafts";

// A newer database on disk makes opening at version 1 fail with VersionError.
it("rejects when the database cannot be opened", async () => {
  await new Promise<void>((resolve) => {
    const open = indexedDB.open("rewind", 2);
    open.onsuccess = () => {
      open.result.close();
      resolve();
    };
  });
  await expect(getDraft("x")).rejects.toMatchObject({ name: "VersionError" });
});
