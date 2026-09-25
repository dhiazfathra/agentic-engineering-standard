# Spec: library

Module `library` from `CAPABILITY-MAP.md`. Depends on `rewinds-api`
(shipped, PR #1). The viewer (PR #2) and extension (PR #3) are shipped.
Status: Approved by the user on 2026-09-24, with the defaults below.

## Objective

Replace the placeholder home page with the library: every Rewind in a
grid, list or board view, filed into folders, reorganised by drag and
drop, renamed and deleted in place with undo on delete, reachable from a
`⌘K` palette, in light or dark mode.

User stories:

- As a user, I open `/` and see all my Rewinds, newest first, as cards,
  rows or a status board, and click one to open `/r/[id]`.
- As a user, I create, rename and delete folders in the sidebar, and
  click a folder to see only its Rewinds.
- As a user, I drag a card onto a board column to change its status, or
  onto a folder to file it. I can do the same from the keyboard.
- As a user, I rename a Rewind inline, and delete a Rewind or a folder
  with Undo. The delete happens only when I close its toast.
- As a user, I press `⌘K` (`Ctrl+K`) to jump to a Rewind, a folder or a
  view, or to switch the theme.
- As a user, I switch dark mode on, and it stays on across reloads and on
  the viewer.

## Layout (from `Rewind.dc.html`, `is.app` and `is.all`)

- **Sidebar**: the "Search or jump to… ⌘K" button, **All Rewinds**, the
  **Folders** heading with `+`, one row per folder (colour dot, name,
  count), and the dark mode toggle at the bottom.
- **Header**: page title (`All Rewinds` or the folder name), the count
  (`N Rewinds`), the Grid / Board / List segment.
- **Grid**: the design's cards (`is.grid`): thumbnail placeholder,
  duration badge, copy-link button on hover, title, reporter initials,
  `url · time ago`, status badge.
- **List**: the design's table (`is.list`): Title, Page, Reporter,
  Length, Status, copy link.
- **Board**: four columns from `COLS` (`STATUS_LABEL`), each card with
  title, url, initials, duration, error count, copy link; "Drop Rewinds
  here" on an empty column.
- **Context menu** on a Rewind (right-click, or its `⋯` button for the
  keyboard): Rename, Move to folder, Set status, Delete. On a folder:
  Rename, Delete.
- **Toast** at the top: messages, and for a delete, Undo and a close
  (`×`) button.
- **Palette**: the design's modal (search input, up to 9 items with a
  kind label, "No results").

Left out of the design's chrome, because the capability map defers or
another module owns them: workspace menu, Recording links and Helpdesk
nav (Recording links arrives with `recording-links`), Group duplicates,
Invite, New Rewind, Get started, Help, Settings.

## Behaviour

- **URL state.** `?view=grid|list|board` (default `grid`) and
  `?folder=<id>` live in the URL, so the server renders the right view
  and a filtered library can be shared. An unknown view falls back to
  `grid`; an unknown folder id shows an empty library titled "Folder not
  found".
- **Optimistic writes.** Every change updates the screen first, then
  calls the API. A failed call reverts the change and shows an error
  toast.
- **Rename.** Enter commits, Escape cancels, blur commits. An empty or
  unchanged title sends nothing. `PATCH /api/rewinds/[id]` `{ title }`,
  `PATCH /api/folders/[id]` `{ name }`.
- **Delete with undo.** Delete hides the item and shows "Rewind deleted"
  (or "Folder “name” deleted") with Undo and `×`. The toast has no timer:
  it stays until the user acts. `×` closes it and sends the `DELETE`.
  Undo restores the item and sends nothing. Several deletes stack one
  toast each, and each is closed or undone on its own. Leaving the page
  (`pagehide`, or a client navigation such as opening a Rewind) counts as
  closing: pending deletes are sent with
  `fetch(..., { keepalive: true })`. Other toasts ("Link copied",
  errors) still clear after 3 s. Deleting a folder moves its Rewinds to
  no folder on screen at once; the database does the same through the
  existing `ON DELETE SET NULL`.
- **New folder.** `+` creates "Untitled folder N" (`POST /api/folders`)
  and opens its name for editing.
- **Drag and drop.** Native HTML5 drag and drop. A card dropped on a
  board column sends `PATCH { status }` and toasts "Moved to <status>". A
  card dropped on a sidebar folder sends `PATCH { folderId }`; dropped on
  All Rewinds, `folderId: null`. The context menu's Move to folder and
  Set status do the same from the keyboard.
- **Palette.** `⌘K`/`Ctrl+K` toggles it; the sidebar button opens it;
  Escape closes it. Items: Go to All Rewinds, each folder, Switch to
  grid/list/board view, Switch to dark/light mode, and every Rewind by
  title. A case-insensitive substring filter, 9 results at most. Arrow
  keys move the selection; Enter runs it.
- **Dark mode.** Toggles `rw-dark` on `<body>`, the class `tokens.css`
  already styles. Stored in `localStorage` (`rewind-theme`). A small
  inline script in the root layout applies it before paint, so neither
  the library nor the viewer flashes light.
- **Copy link.** Same as the viewer: `<origin>/r/<id>`, "Link copied".

## API changes

- `listRewinds()` and `listFolders()` in `apps/web/src/lib/rewinds.ts`,
  shared by the page and by `GET /api/rewinds` and `GET /api/folders`,
  the same way `getRewind` is shared today.
- `listRewinds()` adds `errorCount` (the Rewind's events with
  `isError`), for the board's error label. An additive field on the
  `GET /api/rewinds` response. Approved 2026-09-24.
- No schema change and no new route. No pagination: the list loads
  every Rewind (see Open questions).

## Out of scope

Deferred by the capability map: accounts and workspaces, invite, AI
duplicate grouping, similar Rewinds, integrations, settings pages beyond
appearance. Owned by other modules: capture and "New Rewind"
(`extension`), recording links (`recording-links`). Rename undo: the
design has undo on delete only, and Escape already cancels a rename.
Thumbnails: v1 stores no poster frame, so cards keep the design's
placeholder.

## Code style

A server component loads the rows; a client component owns the library
state and every write. Pure helpers hold the logic, as in the viewer.

```tsx
// apps/web/src/app/page.tsx
export default async function Home({ searchParams }: Props) {
  const { view, folder } = parseLibraryParams(await searchParams);
  const [rewinds, folders] = await Promise.all([listRewinds(), listFolders()]);
  return (
    <Library
      rewinds={rewinds}
      folders={folders}
      view={view}
      folderId={folder}
    />
  );
}
```

CSS Modules over the design's `--rw-*` tokens, no Tailwind. No new
dependency: no drag and drop library, no command palette library.

## Testing strategy

- Unit: the pure helpers (param parsing, folder filter and counts,
  board columns, palette items and filter, untitled folder name, the
  deferred-delete queue), `listRewinds` with `errorCount`, `listFolders`,
  the page. 100% coverage, same thresholds as the rest of `apps/web`.
- DOM (`happy-dom`, as the viewer): view switching, folder filter,
  rename commit and cancel, delete then close, delete then undo, stacked deletes, folder
  create, rename and delete, drop on a column and on a folder, the
  keyboard Move to and Set status, palette open, filter, arrows and
  Enter, dark mode toggle and persistence, failed writes revert.
- E2E: `apps/web/e2e/library.spec.ts` on the seeded database: all three
  views show the seeded Rewinds; a folder filter; rename survives a
  reload; delete then Undo keeps the Rewind after reload, delete then
  `×` removes it, and an open toast sends nothing until closed; a board drag changes the status after reload;
  `⌘K` opens a Rewind; dark mode survives a reload and reaches `/r/[id]`.

## Boundaries

- Always: consume `@rewind/schema` contracts; keep TypeScript on 5.9.x;
  give every drag action a keyboard path.
- Ask first: any schema change, any new route, pagination.
- Never: send a `DELETE` before its toast is closed or the page is left;
  auto-dismiss a delete toast on a timer; add a
  dependency for drag and drop or the palette.

## Success criteria

1. `/` renders every seeded Rewind in grid, list and board, and each
   opens its `/r/[id]`.
2. `/?folder=<seeded folder id>` shows only that folder's Rewinds, and
   sidebar counts match.
3. Rename, folder create, rename and delete, a board drop and a folder
   drop all survive a reload.
4. Delete then Undo leaves the Rewind in the database; delete then `×`
   removes it; while the toast is open, the database still has it.
5. `⌘K`, typing a Rewind's title and Enter opens it.
6. Dark mode survives a reload and applies on `/r/[id]` with no light
   flash.
7. `bun run test`, `lint`, `typecheck` and `e2e` exit 0 at 100% coverage.

## Decisions

Approved on 2026-09-24:

1. `GET /api/rewinds` gains `errorCount` (additive).
2. No pagination in v1. A `ponytail:` comment names the ceiling (the
   whole list in one query and one payload); revisit past a few hundred
   Rewinds.
3. Undo on delete only, as the design. A delete toast has no timer; the
   `DELETE` is sent when the user closes it or leaves the page.
