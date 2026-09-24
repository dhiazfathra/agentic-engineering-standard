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

- [ ] T1: `listRewinds()` (with `errorCount`) and `listFolders()`
- [ ] T2: pure helpers and reducer in `src/lib/library.ts`
- [ ] T3: `/` page, `Library` shell (sidebar, header, grid), shared toast and copy link

### Checkpoint A

- [ ] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [ ] `/` shows the seeded Rewinds as cards; viewer tests still pass
- [ ] Commit and push

### Phase 2: Views and writes

- [ ] T4: list and board views
- [ ] T5: Rewind rename and delete with undo
- [ ] T6: folders: create, rename, delete with undo, filter

### Checkpoint B

- [ ] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [ ] Commit and push

### Phase 3: Movement and polish

- [ ] T7: drag and drop, with the keyboard Move to and Set status
- [ ] T8: `⌘K` palette
- [ ] T9: dark mode

### Checkpoint C

- [ ] `bun run test` at 100%, `lint`, `typecheck` exit 0
- [ ] Commit and push

### Phase 4: Proof

- [ ] T10: `e2e/library.spec.ts`
- [ ] T11: `docs/STACK.md`, `learning/`

### Checkpoint: Complete

- [ ] The seven success criteria in `SPEC-library.md` hold, with evidence
- [ ] `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`

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
