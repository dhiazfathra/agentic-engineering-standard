# Spec: viewer

Module `viewer` from `CAPABILITY-MAP.md`. Depends on `rewinds-api`
(shipped, PR #1). Status: Approved by firstmate on the captain's
delegation on 2026-09-24.

## Objective

Show one Rewind as a shareable bug report at `/r/[id]`: the video or
screenshot, the comments pinned to it and to the timeline, the console,
network and user events captured with it, steps to reproduce built from
those user events, and a button that copies the page's link. It is the
first screen of the app and proves the storage-to-screen path on seeded
data before any capture code exists.

User stories:

- As someone sent a Rewind link, I open it and see what happened: the
  recording, a timeline marked with errors, clicks, navigations and
  comments, and the logs next to it.
- As that viewer, I click an event, a step or a comment to jump the
  recording to that moment.
- As that viewer, I read the console, network and user events in their
  own tabs, and the steps to reproduce and the report's details in Info.
- As that viewer, I click the media to pin a comment at that spot and
  time, and change the Rewind's status.
- As that viewer, I copy the link to send it on.

## Layout (from `Rewind.dc.html`, `is.viewer`)

- **Header**, 64px: back to `/`, title, a meta line (`reporter · time
ago · url`), the status select (`COLS` labels), **Copy link**.
- **Left**: the media in a 16:9 frame, then the player row: play/pause,
  −5s, +5s, the timeline (progress bar, event markers, comment marks with
  initials above it), `m:ss / m:ss`, and the **Comment** toggle. A
  screenshot has no player row: no timeline exists without a duration.
- **Right**, 380px: tabs **Info**, **Events**, **Console**, **Network**,
  **Comments N**. The event rows, colors, tags, current-row highlight and
  dimmed future rows follow the design's `evs`; the comment rows follow
  `clist`.

Tab mapping to the design: the design's Summary tab holds an AI summary,
root cause and similar Rewinds, which the capability map defers. The map
names an Info tab instead. Info holds the steps to reproduce (the
design's `steps` list) and the report details (reporter, created, page
URL, type, duration, status). The design's Actions tab is the map's
Events tab: user events (`nav`, `click`, `input`). Console is `log`,
`warn`, `err`. Network is `net`.

Comment pins on the media show while the playhead is within 4s of the
comment, with a bubble, as the design's `vcomments` do. Timeline markers
are errors (tall, red), navigations (teal) and clicks (grey), as the
design's `markers`.

## Behaviour

- **Missing media.** Seeded Rewinds have no stored object
  (`docs/STACK.md`, `seed.ts`), and v1's server cannot reach MinIO from
  Vercel. The server never checks the object. It signs a `GET` URL, and
  when the browser's `<video>` or `<img>` fails to load it, the frame
  shows a "Media unavailable" state. The timeline, tabs and seeking keep
  working, driven by the stored `durationSeconds`, with play disabled.
- **Playback.** With media, the playhead follows the video's
  `currentTime`; seeking sets it. Without media, seeking moves the
  playhead only.
- **Steps to reproduce.** One numbered step per user event, in time
  order, with its time; clicking seeks. No AI rewrite.
- **Comments.** Comment mode makes the next click on the media open a
  draft at that point (x, y as 0–100 percentages, t the whole second).
  Posting sends `POST /api/rewinds/[id]/comments` with an author name the
  viewer types once; the browser remembers it (v1 has no accounts). The
  new comment appears in the list and on the timeline without a reload.
- **Status.** The select sends `PATCH /api/rewinds/[id]` with `status`.
- **Copy link.** Writes `<origin>/r/<id>` to the clipboard and shows a
  "Link copied" toast.
- **Not found.** An unknown id renders Next's 404.

## API changes

- `getRewind(id)` in `apps/web/src/lib/rewinds.ts`: the query the
  `GET /api/rewinds/[id]` handler runs today, shared by that handler and
  the page, so both return the same shape. The route's response does not
  change.
- `mediaUrl(key)` in `apps/web/src/lib/storage.ts`: a presigned
  `GetObjectCommand` URL, 1-hour TTL. Signing is local, so it works on
  Vercel against the local MinIO the same way uploads do.

No schema change and no new route.

## Out of scope

Deferred by the capability map: AI summary, likely root cause, similar
Rewinds and merge, Send to Linear, accounts (a comment author is free
text). Owned by later modules: the library, rename and delete, dark mode
(`library`); capture (`extension`). Browser, OS and viewport in the meta
line are not captured by the schema, so they are left out.

## Code style

A server component loads the row; a client component owns the playhead.
Pure helpers hold the logic so it is unit tested without a DOM.

```tsx
// apps/web/src/app/r/[id]/page.tsx
export default async function RewindPage({ params }: Props) {
  const { id } = await params;
  const rewind = await getRewind(id);
  if (!rewind) notFound();
  return <Viewer rewind={rewind} mediaUrl={await mediaUrl(rewind.mediaKey)} />;
}
```

CSS Modules over the design's `--rw-*` tokens, no Tailwind (see
`learning/MEMORY.md`).

## Testing strategy

- Unit: the pure helpers (time format, time ago, tab filters, steps,
  markers, current event, pins near the playhead, initials and colors),
  `getRewind`, `mediaUrl`, the page (found and not found), and the client
  component's interactions in a DOM test environment. 100% coverage, same
  thresholds as the rest of `apps/web`.
- E2E: `apps/web/e2e/viewer.spec.ts` seeds the e2e database, opens the
  first seeded Rewind, checks the missing-media state, switches every
  tab and checks its rows, seeks from an event, and clicks Copy link and
  reads the clipboard.

## Boundaries

- Always: consume the `rewinds-api` contracts from `@rewind/schema`; keep
  TypeScript on 5.9.x.
- Ask first: any schema change, any new route.
- Never: check the media object server-side in the request path (Vercel
  cannot reach MinIO in v1); render the page URL as a link without the
  `http(s)` check the create schema already enforces.

## Success criteria

1. `/r/seed-r1` renders the title, meta, missing-media state, a
   timeline with its event markers and 2 comment marks, and every tab
   with the right rows (Events 6, Console 3, Network 4, Comments 2, and
   6 steps in Info).
2. Clicking an event row moves the playhead to its time.
3. Copy link puts `<origin>/r/seed-r1` on the clipboard.
4. `/r/seed-r4` (a screenshot) renders without a player row.
5. `/r/unknown` returns 404.
6. `bun run test`, `lint`, `typecheck` and `e2e` exit 0 at 100% coverage.
