# Implementation Plan: viewer

Module `viewer` from `../CAPABILITY-MAP.md`. Spec: `../SPEC-viewer.md`.
Tasks: `todo-viewer.md`.

## Overview

Add `/r/[id]`: a server component that loads one Rewind and signs its
media URL, and a client component that renders the design's viewer
around a playhead. Pure helpers carry the logic; the component wires
them to the DOM.

## Architecture decisions

- **One query, two callers.** `getRewind(id)` moves from the
  `GET /api/rewinds/[id]` handler into `src/lib/rewinds.ts`. The page
  calls it directly instead of fetching its own API over HTTP, which
  would need an absolute URL and a second round trip. The route keeps its
  response shape and its tests.
- **The browser decides whether media exists.** The server signs a
  `GET` URL without asking MinIO (Vercel cannot reach it in v1). The
  `<video>`/`<img>` `onError` flips the frame to "Media unavailable".
  Seeded Rewinds land there by design.
- **The playhead is React state.** With media, `timeupdate` writes it
  and seeks write `video.currentTime`. Without media, seeks write the
  state only. Everything the design derives from `t` (current event,
  dimmed rows, pins near the playhead, progress) is a pure function of
  `t` and the row.
- **Pure helpers in `src/lib/viewer.ts`.** `formatTime`, `timeAgo`,
  `tabEvents`, `stepsToReproduce`, `timelineMarkers`, `currentEventIndex`,
  `commentsNear`, `initials`, `personColor`, and the event tag and color
  tables. Unit tested without a DOM.
- **DOM tests with `happy-dom`, no Testing Library.** The component's
  interactions (tabs, seek, comment draft and post, status, copy link,
  media error) need a DOM to reach 100% coverage. `happy-dom` as a
  Vitest environment plus `react-dom/client` and React's `act` covers
  it with one dev dependency. A per-file `// @vitest-environment
happy-dom` comment keeps the other suites on Node.
- **Comment author in `localStorage`.** v1 has no accounts; the draft
  asks for a name once and remembers it. Reads and writes sit in
  `try/catch` so a blocked storage only means asking again.
- **The e2e seeds its own database.** `playwright.config.ts`'s web
  server runs `db:seed` after `drizzle-kit migrate`, so the viewer spec
  opens `seed-r1` and `seed-r4` on a fresh DB each run.

## Dependency graph

```
T1 getRewind + mediaUrl ── T3 /r/[id] page ── T4 Viewer component ── T6 e2e
T2 pure helpers ───────────────────────────────┘                       │
T5 happy-dom DOM tests (with T4) ──────────────────────────────────────┘
T6 ── T7 docs (STACK.md, MEMORY)
```

## Task list

### Phase 1: Data and logic

- [ ] T1: `getRewind(id)` and `mediaUrl(key)`
- [ ] T2: pure helpers in `src/lib/viewer.ts`

### Checkpoint A

- [ ] `bun run test`, `lint`, `typecheck` exit 0 at 100%
- [ ] Commit

### Phase 2: Page

- [ ] T3: `/r/[id]/page.tsx` (found, not found)
- [ ] T4: `Viewer` client component and `viewer.module.css`
- [ ] T5: DOM tests for the component

### Checkpoint B

- [ ] `bun run test` at 100%; `lint`, `typecheck` clean
- [ ] Commit

### Phase 3: Proof

- [ ] T6: `e2e/viewer.spec.ts`, seed in the Playwright web server
- [ ] T7: `docs/STACK.md` (routes, e2e list), `learning/`

### Checkpoint: Complete

- [ ] The six success criteria in `SPEC-viewer.md` hold, with evidence
- [ ] `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`

## Risks and mitigations

| Risk                                                                   | Impact | Mitigation                                                                                                      |
| ---------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Passing the row from server to client breaks on `Date` fields          | Med    | React serializes `Date` across the boundary; a page test asserts the prop shape, and the e2e proves it renders. |
| `<video>` `onError` does not fire for a 404 on `src`                   | Med    | Listen on both the element and its `error` event; the e2e asserts the missing-media state on `seed-r1`.         |
| Clipboard reads need permissions in Playwright                         | Low    | Grant `clipboard-read` and `clipboard-write` in the spec's context.                                             |
| A comment `x`/`y` at the frame edge pushes the bubble out of the frame | Low    | Clamp the bubble like the design: `min(x, 68)%`, `min(y, 72)%`.                                                 |
