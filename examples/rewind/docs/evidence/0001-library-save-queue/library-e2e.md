# Evidence: library end-to-end tests pass against a production build

Task: PR #4 (head `53ab694`). The Playwright web server deletes `e2e.db`,
migrates, seeds, then runs `next build` and `next start`
(`apps/web/playwright.config.ts`).

## Command run

```sh
cd examples/rewind/apps/web
PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH npx playwright test e2e/library.spec.ts --reporter=list
```

## Output

```text

Running 11 tests using 1 worker

  ✓   1 e2e/library.spec.ts:14:7 › library › all three views render seeded Rewinds and open the viewer (732ms)
  ✓   2 e2e/library.spec.ts:40:7 › library › folder filter shows only that folder's Rewinds, counts match (153ms)
  ✓   3 e2e/library.spec.ts:55:7 › library › unknown folder id shows Folder not found (114ms)
  ✓   4 e2e/library.spec.ts:60:7 › library › rename survives reload (281ms)
  ✓   5 e2e/library.spec.ts:81:7 › library › folder create, rename and delete survive reload (596ms)
  ✓   6 e2e/library.spec.ts:146:7 › library › move to folder via context menu survives reload (271ms)
  ✓   7 e2e/library.spec.ts:166:7 › library › board drag changes status and survives reload (281ms)
  ✓   8 e2e/library.spec.ts:181:7 › library › delete then Undo leaves the Rewind after reload (279ms)
  ✓   9 e2e/library.spec.ts:205:7 › library › delete then × removes it; nothing is sent while the toast is open (290ms)
  ✓  10 e2e/library.spec.ts:231:7 › library › ⌘K palette opens a Rewind by title (185ms)
  ✓  11 e2e/library.spec.ts:242:7 › library › dark mode survives reload and applies on the viewer with no flash (353ms)

  11 passed (13.3s)
exit=0
```

## Screenshots / video

None. The claims here are about which requests are sent and what the
screen rolls back to, which the test output proves. Screenshots of every
library view are in the PR description.
