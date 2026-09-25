# Evidence: the library tests catch each save-queue bug they were written for

Task: PR #4, save queue in `apps/web/src/app/library.tsx` (head `53ab694`).

Each run copies the head version of `apps/web/src/app/library.test.tsx`
into a detached worktree at an older commit and runs it there. A test that
fails on the older code and passes at head proves it detects that bug.

| Commit    | What it is                                                            | Result                                                               |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `1bda58b` | overlap bookkeeping, before the queue                                 | 3 failed: two queue-order tests and the deleted-folder rollback test |
| `4c64b97` | pipeline commit that read live state at flush (reverted in `9da03aa`) | 1 failed: queued rename failing after the first succeeds             |
| `295a792` | queue plus idle refresh of the confirmed value                        | all 96 passed                                                        |

## Command run

For each commit `C`:

```sh
git worktree add --detach <tmp>/wt-C C
cp apps/web/src/app/library.test.tsx <tmp>/wt-C/examples/rewind/apps/web/src/app/
# node_modules symlinked from the main checkout
cd <tmp>/wt-C/examples/rewind/apps/web
PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH npx vitest run src/app/library.test.tsx --coverage.enabled=false
git worktree remove --force <tmp>/wt-C
```

## Output: `1bda58b`

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - import "./local-env" without a file extension (vitest.config.mts:3:26). Add the file extension
  - ESM syntax in a file loaded as CommonJS (local-env.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 <tmp>/wt-1bda58b/examples/rewind/apps/web

 ❯ src/app/library.test.tsx (96 tests | 3 failed) 460ms
   ❯ rename (15)
     × rename twice while first PATCH pending sends only one PATCH until first resolves 12ms
     × three rapid renames while first pending sends only two PATCHes with newest title 12ms
   ❯ drag and drop (19)
     × a failed move after folder was deleted rolls back to unfiled, not the deleted folder 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/library.test.tsx > rename > rename twice while first PATCH pending sends only one PATCH until first resolves
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/app/library.test.tsx:601:23
    599|     await flush();
    600|
    601|     expect(fetchMock).toHaveBeenCalledTimes(1);
       |                       ^
    602|     expect(container.textContent).toContain("Second");
    603|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/app/library.test.tsx > rename > three rapid renames while first pending sends only two PATCHes with newest title
AssertionError: expected "vi.fn()" to be called 1 times, but got 3 times
 ❯ src/app/library.test.tsx:644:23
    642|     await flush();
    643|
    644|     expect(fetchMock).toHaveBeenCalledTimes(1);
       |                       ^
    645|     expect(container.textContent).toContain("Third");
    646|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/app/library.test.tsx > drag and drop > a failed move after folder was deleted rolls back to unfiled, not the deleted folder
AssertionError: expected "vi.fn()" to be called 3 times, but got 4 times
 ❯ src/app/library.test.tsx:1515:23
    1513|     click(menuItem("Move to All Rewinds"));
    1514|     await flush();
    1515|     expect(fetchMock).toHaveBeenCalledTimes(3);
       |                       ^
    1516|   });
    1517|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 93 passed (96)
   Start at  07:21:41
   Duration  990ms (tests 51%, environment 26%, transform 16%, import 7%)

exit=1
```

## Output: `4c64b97`

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - import "./local-env" without a file extension (vitest.config.mts:3:26). Add the file extension
  - ESM syntax in a file loaded as CommonJS (local-env.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 <tmp>/wt-4c64b97/examples/rewind/apps/web

 ❯ src/app/library.test.tsx (96 tests | 1 failed) 461ms
   ❯ rename (15)
     × a queued rename that fails after the first succeeds rolls back to the first 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/library.test.tsx > rename > a queued rename that fails after the first succeeds rolls back to the first
AssertionError: expected 'Search or jump to…⌘KAll RewindsFolder…' to contain 'First'

Expected: "First"
Received: "Search or jump to…⌘KAll RewindsFolders+🌙Toggle dark modeAll Rewinds1 RewindsGridBoardList0:42SecondMChttps://shop.acme.co/cart · 5 min agoNew⋯Copy linkCould not rename Rewind"

 ❯ src/app/library.test.tsx:706:35
    704|     });
    705|
    706|     expect(container.textContent).toContain("First");
       |                                   ^
    707|     expect(container.textContent).not.toContain("Second");
    708|     expect(container.textContent).toContain("Could not rename Rewind");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 95 passed (96)
   Start at  07:21:56
   Duration  866ms (tests 58%, environment 19%, transform 17%, import 6%)

exit=1
```

## Output: `295a792`

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - import "./local-env" without a file extension (vitest.config.mts:3:26). Add the file extension
  - ESM syntax in a file loaded as CommonJS (local-env.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 <tmp>/wt-295a792/examples/rewind/apps/web


 Test Files  1 passed (1)
      Tests  96 passed (96)
   Start at  07:21:50
   Duration  871ms (tests 58%, environment 19%, transform 17%, import 6%)

exit=0
```
