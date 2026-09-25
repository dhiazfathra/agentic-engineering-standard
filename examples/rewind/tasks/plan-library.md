# Implementation Plan: library

Module `library` from `../CAPABILITY-MAP.md`. Spec: `../SPEC-library.md`
(approved 2026-09-24). Tasks: `todo-library.md`.

## Overview

Turn `/` into the library: a server component that loads every Rewind
and folder, and a client component that renders the design's sidebar,
header and three views, and owns every write (rename, delete with undo,
folders, drag and drop), the `⌘K` palette and dark mode. Pure helpers
carry the logic; the component wires them to the DOM.

## Architecture decisions

- **Shared queries, as `getRewind`.** `listRewinds()` and `listFolders()`
  move into `src/lib/rewinds.ts`. The page calls them directly; the two
  `GET` routes call them too, so both return one shape.
- **`errorCount` by subquery.** `listRewinds()` selects a correlated
  `count(*)` over `events` where `isError`. One query, no N+1. Approved
  (spec decision 1).
- **View and folder in the URL.** `searchParams` decide the first
  render, so the server paints the right view with no flash. The client
  updates them with `router.replace`, no reload.
- **Optimistic state in one reducer.** The client holds `rewinds` and
  `folders` in `useReducer`. Each write dispatches first, calls the API,
  and dispatches the inverse on failure. The reducer is pure and unit
  tested.
- **Deferred delete, closed by hand, no schema change.** A
  pending-delete list holds each deleted item's snapshot and its
  `DELETE` request. The toast has no timer: `×` sends the request, Undo
  restores the snapshot. Leaving the page (`pagehide`, or the library
  unmounting on a client navigation) sends every pending request with
  `keepalive`. Soft delete would need a column (ask first) for no gain
  over a client-side pending list.
- **Shared toast and copy link.** The viewer already has an inline
  toast and a clipboard copy. T3 moves them into
  `src/components/toast.tsx` (`useToast`: plain toasts clear after 3 s; a delete toast carries
  Undo and `×` and never clears on its own; several stack)
  and `src/lib/copy-link.ts`, and the viewer uses them. One toast, not
  two.
- **Native drag and drop, keyboard mirror.** `draggable` cards and
  `onDragOver`/`onDrop` targets, the id in `dataTransfer`. The context
  menu's Move to folder and Set status call the same handlers, so the
  drop and the keyboard share one code path.
- **Dark mode before paint.** A tiny inline `<script>` in
  `layout.tsx` reads `localStorage` and sets `body.rw-dark` before the
  first paint; `suppressHydrationWarning` on `<body>`. The toggle writes
  both. The viewer inherits it through the root layout.
- **No pagination.** One query loads every Rewind, marked with a
  `ponytail:` comment naming the ceiling (spec decision 2).

## Dependency graph

```
T1 listRewinds/listFolders ─┐
T2 pure helpers + reducer ──┼─ T3 page + shell + grid ─┬─ T4 list/board ─ T7 drag and drop
                            │   (shared toast, copy)   ├─ T5 rename/delete undo
                            │                          ├─ T6 folders
                            │                          └─ T8 palette
T9 dark mode (layout) ──────┘
T3..T9 ── T10 e2e ── T11 docs
```

T4 to T9 depend only on T3 and touch separate parts of `library.tsx`,
but they share that file, so they run one after another, not in
parallel.

## Task list

### Phase 1: Data, logic, shell

- [x] T1: `listRewinds()` (with `errorCount`) and `listFolders()`
- [x] T2: pure helpers and reducer in `src/lib/library.ts`
- [x] T3: `/` page, `Library` shell (sidebar, header, grid), shared toast and copy link

### Checkpoint A

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] `/` shows the seeded Rewinds as cards; viewer tests still pass
- [x] Commit and push

### Phase 2: Views and writes

- [x] T4: list and board views
- [x] T5: Rewind rename and delete with undo
- [x] T6: folders: create, rename, delete with undo, filter

### Checkpoint B

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] Commit and push

### Phase 3: Movement and polish

- [x] T7: drag and drop, with the keyboard Move to and Set status
- [x] T8: `⌘K` palette
- [x] T9: dark mode

### Checkpoint C

- [x] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [x] Commit and push

### Phase 4: Proof

- [x] T10: `e2e/library.spec.ts`
- [x] T11: `docs/STACK.md`, `learning/`

### Checkpoint: Complete

- [x] The seven success criteria in `SPEC-library.md` hold, with evidence
- [x] `/security-review`, `/performance`, `/documentation-and-adrs`
- [x] The learn skill updates `learning/`

## Risks and mitigations

| Risk                                                           | Impact | Mitigation                                                                                                               |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| HTML5 drag and drop events are thin in `happy-dom`             | Med    | Unit test the drop handlers through the keyboard path they share; the e2e drives a real drag with Playwright's `dragTo`. |
| A pending delete is lost if the tab closes with its toast open | Med    | `pagehide` and unmount flush with `keepalive`. If the flush fails, the Rewind stays: the safe direction.                 |
| Delete toasts pile up and cover the page                       | Low    | Stack them with a cap on height; the oldest scroll. Each `×` or Undo removes its own.                                    |
| Dark mode flashes light on first paint                         | Low    | Inline script in `<head>` sets the class before paint; e2e checks the class on load of `/r/[id]`.                        |
| Optimistic state drifts from the server after a failed revert  | Low    | The reducer's inverse actions are unit tested; a failed write also toasts, so the user knows to reload.                  |
| Extracting the viewer's toast breaks its tests                 | Low    | T3 runs the viewer suite unchanged apart from imports before committing.                                                 |
| The whole list in one payload grows slow                       | Low    | `ponytail:` comment with the ceiling; pagination is an "ask first" follow-up.                                            |

## Decisions

All three spec questions were approved with their defaults on
2026-09-24; see `SPEC-library.md`.

## Finishing notes

- Success criteria: `bun run --filter web test` 290 passed at 100%
  coverage; `lint`, `typecheck` and `build` exit 0; the web e2e suite
  (`e2e/library.spec.ts` covers criteria 1 to 6) passed 22/22 three times
  in a row for the T10 worker and once more on a separate run of my own.
  The extension e2e was not rerun: this module does not touch
  `apps/extension`.
- `/security-review` (by hand on `git diff main...HEAD`): no
  high-confidence findings. The one `dangerouslySetInnerHTML` is the
  constant `THEME_INIT_SCRIPT`. A dropped id is looked up in the loaded
  Rewinds before any request, so dragged-in text from another page sends
  nothing. Every write goes to a route that validates with the shared zod
  schemas. Not fixed, recorded: anyone who can reach the app can rename,
  re-status and delete any Rewind, because v1 has no auth (capability
  map).
- `/performance` (lab, `next start` on the seeded DB, this PC): `/` TTFB
  4.5 to 6.8 ms over 5 requests, HTML 22 KB, 8 JS files totalling
  184 KB as served (under the 300 KB budget). `listRewinds` is one query:
  `EXPLAIN QUERY PLAN` shows the list scanning `rewinds_created_at_idx`
  and the `errorCount` subquery using `events_rewind_id_idx`, so no N+1
  and no full scan of `events`. Not fixed, recorded: no pagination and no
  list virtualisation (spec decision 2); revisit past a few hundred
  Rewinds.
- `/documentation-and-adrs`: `docs/STACK.md` lists the page, the new
  files and the e2e spec; `learning/MEMORY.md` records the module. No
  ADR: the client-side pending-delete list is cheap to reverse (no schema
  or API change) and is recorded in `SPEC-library.md`.
- Deviations: T7, T8, T9 and the folder-flash fix landed in one commit
  (`2e3c9cd`) instead of four. Creating a folder waits for the `POST`
  instead of being optimistic. Context menus close on Escape and outside
  click but have no arrow-key navigation.
