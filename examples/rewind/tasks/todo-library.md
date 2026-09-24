# Tasks: library

Plan: `plan-library.md`. Spec: `../SPEC-library.md`. All commands run
from `examples/rewind/` unless a task says otherwise. Prefix commands
that run Node with `. ~/.nvm/nvm.sh && nvm use >/dev/null`.

## T1: `listRewinds` and `listFolders`

- [x] `src/lib/rewinds.ts` exports `listRewinds()`: every Rewind, newest
      first, with `errorCount` (correlated count of its `isError`
      events), and `listFolders()`. A `ponytail:` comment names the
      no-pagination ceiling.
- [x] `GET /api/rewinds` and `GET /api/folders` call them; their tests
      pass with only the mock target changed, plus `errorCount` asserted.
- [x] Unit tests for both helpers, including a Rewind with 0 errors.

**Verification:** `bun run --filter web test` at 100%.
**Dependencies:** None · **Files:** `src/lib/rewinds.ts`, its test, the
two routes and their tests · **Scope:** S

## T2: Pure helpers and reducer

- [x] `src/lib/library.ts`: `parseLibraryParams` (view default `grid`,
      folder optional), `filterByFolder`, `folderCounts`, `boardColumns`
      (four `STATUS_LABEL` columns), `nextFolderName` ("Untitled folder
      N"), `paletteItems(rewinds, folders, dark)` and
      `filterPalette(items, query)` (case-insensitive, 9 max).
- [x] `libraryReducer` with actions: rename, setStatus, setFolder,
      removeRewind, restoreRewind, addFolder, renameFolder,
      removeFolder (unfiles its Rewinds), restoreFolder.
- [x] Every branch unit tested.

**Verification:** `bun run --filter web test` at 100%.
**Dependencies:** None · **Files:** `src/lib/library.ts`,
`src/lib/library.test.ts` · **Scope:** S

### Checkpoint A (part 1)

- [x] `bun run test`, `lint`, `typecheck` exit 0; commit and push T1, T2

## T3: Page, shell, grid

- [x] `src/components/toast.tsx` (`useToast`: plain toasts clear after
      3 s; action toasts carry Undo and `×`, have no timer, and stack) and `src/lib/copy-link.ts`, moved out
      of `r/[id]/viewer.tsx`; the viewer uses them and its tests pass.
- [x] `src/app/page.tsx`: parses `searchParams`, loads with
      `Promise.all`, renders `<Library>`. Test found and folder cases.
- [x] `src/app/library.tsx` (`"use client"`) and `library.module.css`:
      sidebar (palette button, All Rewinds, folders with dot and count,
      theme toggle slot), header (title, count, view segment updating
      the URL), grid cards per `is.grid` with copy link on hover. Cards
      link to `/r/[id]`.
- [x] DOM test (`happy-dom`): cards render, view segment calls
      `router.replace`, folder click filters, copy link toasts.

**Verification:** tests at 100%; `bun run dev`, open `/`, see 8 seeded
cards. **Dependencies:** T1, T2 · **Scope:** M

### Checkpoint A

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] Commit and push

## T4: List and board views

- [x] List per `is.list`: Title, Page, Reporter, Length, Status, copy.
- [x] Board per `is.board`: four columns with counts, cards with error
      label when `errorCount > 0`, "Drop Rewinds here" when empty.
- [x] DOM tests for both views and the empty column.

**Dependencies:** T3 · **Scope:** S

## T5: Rename and delete with undo

- [x] Context menu on right-click and on a `⋯` button: Rename, Delete
      (Move to and Set status land in T7).
- [x] Inline rename: Enter and blur commit, Escape cancels, empty or
      unchanged sends nothing; failed `PATCH` reverts and toasts.
- [x] Delete: hide, toast "Rewind deleted" with Undo and `×`, no timer;
      `×` sends `DELETE`; Undo restores and sends nothing; stacked
      deletes close independently; `pagehide` and unmount send every
      pending `DELETE` with `keepalive`;
      failed `DELETE` restores and toasts.
- [x] DOM tests for every branch above, including a toast left open
      with fake timers advanced 60 s sending nothing.

**Dependencies:** T3 · **Scope:** M

## T6: Folders

- [x] `+` posts "Untitled folder N" and opens it for rename.
- [x] Folder context menu: Rename (inline, same rules as T5), Delete
      with Undo and `×` (unfiles its Rewinds on screen; `DELETE` on `×`).
- [x] Deleting the folder being viewed returns to All Rewinds.
- [x] `?folder=<unknown>` shows "Folder not found" and no Rewinds.
- [x] DOM tests for create, rename, delete, undo, failures.

**Dependencies:** T3, T5 (shares the deferred-delete code) · **Scope:** M

### Checkpoint B

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] Commit and push

## T7: Drag and drop

- [x] Board cards `draggable`; columns accept drops, send
      `PATCH { status }` and toast "Moved to <status>".
- [x] Any card drops on a sidebar folder (`PATCH { folderId }`) or on
      All Rewinds (`folderId: null`); the drop target highlights.
- [x] Context menu gains Move to folder and Set status, calling the
      same handlers.
- [x] DOM tests through the handlers and the keyboard path; a
      synthetic `drop` event with `dataTransfer` for the wiring.

**Dependencies:** T4, T6 · **Scope:** M

## T8: `⌘K` palette

- [x] `⌘K`/`Ctrl+K` toggles, sidebar button opens, Escape and backdrop
      close. Input autofocused; items from `paletteItems`, filtered;
      arrows move the selection; Enter or click runs it; "No results".
- [x] `role="dialog"`, `aria-modal`, listbox with `aria-activedescendant`.
- [x] DOM tests: open both ways, filter, arrows, Enter on a Rewind
      navigates, Enter on a view updates the URL, close.

**Dependencies:** T3 · **Scope:** S

## T9: Dark mode

- [x] Inline script in `layout.tsx` sets `body.rw-dark` from
      `localStorage` (`rewind-theme`) before paint, inside `try/catch`.
- [x] Sidebar toggle and palette item flip the class and the stored
      value.
- [x] Tests: layout renders the script; toggle writes both; blocked
      storage still toggles for the session.

**Dependencies:** T3, T8 · **Scope:** S

### Checkpoint C

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] Commit and push

## T10: E2E

- [x] `apps/web/e2e/library.spec.ts` on the seeded DB covers success
      criteria 1 to 6: three views, folder filter, rename after reload,
      delete then Undo, delete then `×`, an open toast sending nothing, board `dragTo` after reload, `⌘K` to
      a Rewind, dark mode after reload and on `/r/seed-r1`.

**Verification:** `bun run --filter web e2e` exits 0.
**Dependencies:** T4 to T9 · **Scope:** S

## T11: Docs

- [x] `docs/STACK.md`: `/` library, new lib and component files, e2e list.
- [x] `learning/MEMORY.md` line for the library.

**Dependencies:** T10 · **Scope:** XS

### Checkpoint: Complete

- [x] All seven success criteria in `SPEC-library.md` hold, with evidence
- [x] `/security-review`, `/performance`, `/documentation-and-adrs`
- [x] The learn skill updates `learning/`
