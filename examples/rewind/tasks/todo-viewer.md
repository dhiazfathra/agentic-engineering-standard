# Tasks: viewer

Plan: `plan-viewer.md`. Spec: `../SPEC-viewer.md`. All commands run from
`examples/rewind/` unless a task says otherwise. Prefix commands that run
Node with `. ~/.nvm/nvm.sh && nvm use >/dev/null`.

## T1: `getRewind` and `mediaUrl`

- [ ] `src/lib/rewinds.ts` exports `getRewind(id)`: the `findFirst` with
      `events` and `comments` ordered by `t`, moved out of
      `api/rewinds/[id]/route.ts`. The route calls it; its tests pass
      unchanged apart from the mock target. The inferred return type is
      exported as `RewindDetail`.
- [ ] `src/lib/storage.ts` exports `mediaUrl(key)`: `getSignedUrl` over a
      `GetObjectCommand`, `expiresIn: 3600`. Unit test with the presigner
      stubbed.

**Dependencies:** None · **Scope:** S

## T2: Pure helpers

- [ ] `src/lib/viewer.ts`: `formatTime` (`m:ss`, floors), `timeAgo`
      (`Just now`, `N min ago`, `N h ago`, `N d ago`), `tabEvents(events,
tab)` for `events`/`console`/`network`, `stepsToReproduce`,
      `timelineMarkers(events, duration)`, `currentEventIndex(events, t)`,
      `commentsNear(comments, t)` (within 4s), `initials`, `personColor`
      (the design's `PEOPLE`, else a stable hash into a small palette),
      `EVENT_TAG`, `EVENT_TONE`, `STATUS_LABEL`.
- [ ] Every branch unit tested.

**Dependencies:** None · **Scope:** S

### Checkpoint A

- [ ] `bun run test` at 100%, `bun run lint` and `bun run typecheck` exit 0
- [ ] Commit

## T3: `/r/[id]` page

- [ ] `src/app/r/[id]/page.tsx`: awaits `params`, `getRewind`,
      `notFound()` when missing, else renders `<Viewer>` with the row and
      `mediaUrl`. `generateMetadata` sets the title to the Rewind's.
- [ ] Tests: found renders the Viewer with the row; missing calls
      `notFound`.

**Dependencies:** T1 · **Scope:** S

## T4: `Viewer` component

- [ ] `src/app/r/[id]/viewer.tsx` (`"use client"`) and
      `viewer.module.css`, matching `Rewind.dc.html`'s `is.viewer`
      block with the `--rw-*` tokens: header (back, title, meta, status
      select, Copy link), media frame (video or image, pins, draft
      popover, missing-media state), player row for videos (play/pause,
      −5s, +5s, timeline with markers and comment marks, time, Comment
      toggle), right panel tabs Info, Events, Console, Network, Comments.
- [ ] Status select PATCHes `/api/rewinds/[id]`; a failed request
      reverts the select and shows an error toast.
- [ ] Posting a comment POSTs `/api/rewinds/[id]/comments` and appends
      the returned row; a failed request keeps the draft and shows an
      error toast.
- [ ] Copy link writes `location.origin + "/r/" + id`, toast "Link copied".
- [ ] Accessible: buttons are `<button>`, tabs use `role="tablist"`/`tab`
      with `aria-selected`, the timeline is a `role="slider"` with
      `aria-valuenow`.

**Dependencies:** T2, T3 · **Scope:** M

## T5: DOM tests

- [ ] `happy-dom` dev dependency; `viewer.test.tsx` runs under
      `// @vitest-environment happy-dom` with `react-dom/client` and `act`.
- [ ] Covers: tab switching, seek from event/step/comment/timeline,
      ±5s, play/pause with media, media error state, screenshot without
      a player row, comment mode draft and post (success and failure),
      author remembered, status change (success and failure), copy link.

**Dependencies:** T4 · **Scope:** M

### Checkpoint B

- [ ] `bun run test` at 100%, `lint` and `typecheck` exit 0
- [ ] Commit

## T6: E2E

- [ ] `playwright.config.ts` web server runs the seed after migrate.
- [ ] `e2e/viewer.spec.ts`: `/r/seed-r1` shows title and missing-media
      state; each tab shows its row count; clicking an event moves the
      time readout; Copy link puts `<origin>/r/seed-r1` on the clipboard;
      `/r/seed-r4` has no timeline; `/r/unknown` is 404.

**Dependencies:** T4 · **Scope:** S

## T7: Docs

- [ ] `docs/STACK.md`: the `/r/[id]` page in the structure and the e2e list.
- [ ] `learning/MEMORY.md` line for the viewer.

**Dependencies:** T6 · **Scope:** XS

### Checkpoint: Complete

- [ ] All six success criteria in `SPEC-viewer.md` hold, with evidence
- [ ] `/security-review`, `/performance`, `/documentation-and-adrs`
- [ ] The learn skill updates `learning/`
