# Implementation Plan: extension

Module `extension` from `../CAPABILITY-MAP.md`. Spec:
`../SPEC-extension.md`. Tasks: `todo-extension.md`.

## Overview

Grow the `apps/extension` WXT skeleton into the capture extension: two
content scripts that record events, a background that buffers them and
takes screenshots and replay snapshots, and three React pages (popup,
recorder, editor) over pure helpers in `lib/`. Uploads go through the
existing `rewinds-api` routes.

## Architecture decisions

- **Everything the pages share goes through `lib/`.** `lib/` is not an
  entrypoint directory, so WXT ignores it, and tests import it directly.
  Entrypoints stay thin.
- **One draft store for every capture.** IndexedDB (`lib/drafts.ts`,
  plain `indexedDB` with a small promise helper, no `idb` dependency)
  holds screenshots, recordings and replays until they are filed. Pages
  pass only a draft id in the URL, so no blob crosses a message.
- **Events carry absolute time until a capture is cut.** Content
  scripts stamp `at` (epoch ms). `lib/timeline.ts` turns `at` into media
  seconds over the capture's active spans, so pauses, trims and the
  2-minute windows all use one function.
- **The recorder is a visible extension window.** It works the same in
  Chrome and Firefox, can prompt for the microphone, and stays alive for
  the whole recording. Tab and area use `tabCapture` (Chrome only);
  desktop uses `getDisplayMedia`.
- **Mediabunny for every video write.** It remuxes MediaRecorder output
  (adding the duration and cues the viewer needs to seek), applies the
  trim, and encodes replay snapshots with WebCodecs. One dependency
  instead of a hand-written WebM muxer.
- **Browser-only calls live in `lib/media.ts`.** `MediaRecorder`,
  `getDisplayMedia`, `getUserMedia`, `MediaStreamTrackProcessor`,
  Mediabunny and canvas export. Unit tests mock this module; the e2e
  runs it for real in Chromium.
- **Tokens are imported from the web app.** `styles/base.css` imports
  `../../web/src/styles/tokens.css`, so both apps use one file. Fonts come
  from `@fontsource-variable/inter` and `@fontsource/poppins`, bundled
  into the extension, since `next/font` only works in Next.
- **The e2e runs the real stack.** The extension's Playwright config
  starts the web app the same way `apps/web/playwright.config.ts` does
  (fresh `e2e.db`, real MinIO), on port 3200, and sets the extension's
  `appUrl` to it through `storage.local` before each test.

## Message contract (`lib/messages.ts`)

```ts
export type CapturedEvent = {
  at: number;
  kind: EventKind;
  text: string;
  isError: boolean;
};
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
};
export type Message =
  | { type: "event"; event: CapturedEvent } // content -> background
  | { type: "events"; tabId: number; spans: Span[] } // -> Event[] (media time)
  | { type: "screenshot"; tabId: number } // popup -> background (delay from settings)
  | { type: "record"; tabId: number; mode: RecordMode; streamId?: string } // popup -> background: opens the recorder window
  | { type: "recording"; tabId: number; since: number | null } // recorder -> background: hold the buffer from `since`
  | { type: "select-area" } // background -> content: -> Rect | null
  | { type: "area"; tabId: number } // recorder -> background: focuses the tab and relays select-area -> Rect | null
  | { type: "save-replay"; tabId: number }; // popup/command -> background
```

## Draft record (`lib/drafts.ts`)

```ts
export type Draft = {
  id: string;
  createdAt: number;
  url: string; // the page, http(s)
  kind: "screenshot" | "video" | "replay";
  blob?: Blob; // image/png or video/webm
  frames?: { at: number; blob: Blob }[]; // replay, until the editor encodes it
  durationSeconds?: number;
  events: Event[]; // @rewind/schema Event, t already in media seconds
};
```

## Dependency graph

```
T1 setup (deps, manifest, styles, test config)
 └─ T2 lib: messages, events, timeline, buffer, settings, drafts, upload
     ├─ T3 content scripts
     ├─ T4 background ──────────────┐
     ├─ T5 popup                    │
     ├─ T6 media.ts + recorder      │
     └─ T7 editor (uses T6 media) ──┴─ T8 e2e ── T9 docs
```

## Task list

### Phase 1: Foundation

- [x] T1: setup
- [x] T2: `lib/` pure modules

### Checkpoint A

- [x] `bun run --filter extension test`, `lint`, `typecheck` exit 0 at 100%
- [x] Commit

### Phase 2: Capture

- [x] T3: content scripts
- [x] T4: background

### Checkpoint B

- [x] Tests at 100%; `bun run --filter extension build` produces both targets
- [x] Commit

### Phase 3: Pages

- [x] T5: popup
- [x] T6: `lib/media.ts` and the recorder
- [x] T7: editor

### Checkpoint C

- [x] Tests at 100%, lint and typecheck clean, build clean
- [x] Commit

### Phase 4: Proof

- [x] T8: e2e
- [x] T9: docs, manual check, learning

### Checkpoint: Complete

- [x] The five success criteria in `SPEC-extension.md` hold, with evidence
- [x] `/security-review`, `/performance`, `/documentation-and-adrs`
- [x] The learn skill updates `learning/`

## Risks and mitigations

| Risk                                                                    | Impact | Mitigation                                                                                                          |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Headless Chromium cannot auto-pick a `getDisplayMedia` source           | Med    | Try `--auto-select-tab-capture-source-by-title`; if it fails, keep the recording e2e out and record it as manual.   |
| `captureVisibleTab` needs the target tab active in a focused window     | Med    | The e2e brings the fixture page to front first; the background passes the tab's `windowId`.                         |
| The MV3 service worker sleeps and loses the event buffer or replay loop | Med    | Mirror the buffer to `storage.session`; a 30s alarm restarts the replay loop.                                       |
| WebCodecs or Mediabunny misbehave in headless Chromium                  | Med    | The replay e2e proves it; if VP9 fails, fall back to VP8 in `media.ts`.                                             |
| Firefox MV3 host permissions are optional and may not be granted        | Low    | The popup checks `permissions.contains` and asks with `permissions.request` from its click; manual check covers it. |
| A cross-app CSS import breaks WXT's dev server                          | Low    | Vite allows files inside the workspace root; the build and the popup e2e prove the tokens load.                     |

## Finishing notes

- `/security-review` (by hand on the changed code):
  - Fixed: a page can post the MAIN world's `{ source: "rewind", event }`
    message itself. A malformed one (non-string text, unknown kind,
    far-future time) broke capture or the upload for that tab, so the
    background now drops any event that fails its schema. A well-formed
    forged event is accepted: the page could log the same text.
  - Recorded, not fixed: captured network events keep the query string,
    which can hold tokens. They stay in the tab's local buffer and leave
    the browser only when the user files a Rewind, which then shows them
    to anyone with the link (v1 has no auth). Input values are never
    captured.
  - Uploads go only to the configured web app and the presigned URL it
    returns; the web app URL must be `http(s)`. Event text renders as
    React text in the extension and the viewer, never as HTML.
- `/performance`:
  - Every page pays for the console, fetch and XHR wrappers and one
    `runtime.sendMessage` per event. The background writes the buffer to
    `storage.session` at most once a second.
  - Instant replay takes a JPEG `captureVisibleTab` every second while
    it is on, which is why it is off by default. Snapshots older than 2
    minutes are pruned on each tick.
  - Not fixed, recorded: `encodeFrames` decodes all snapshots (up to 120)
    into `ImageBitmap`s at once before encoding. Fine at 2 minutes of
    viewport-sized JPEGs; stream them if the window grows.
- `/documentation-and-adrs`: `docs/STACK.md` lists the extension's
  structure, the Firefox MV3 output and the e2e's web server;
  `docs/extension-manual-check.md` lists the checks the e2e cannot run.
  No ADR: the extension files Rewinds through the unchanged `rewinds-api`
  contract (ADR-0001), and its own choices (recorder window, IndexedDB
  drafts, Mediabunny) are recorded in `SPEC-extension.md` and are cheap
  to reverse.
