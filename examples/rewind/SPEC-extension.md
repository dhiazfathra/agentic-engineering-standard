# Spec: extension

Module `extension` from `CAPABILITY-MAP.md`. Depends on `rewinds-api`
(shipped, PR #1). Status: Approved by firstmate on the captain's
delegation on 2026-09-24.

## Objective

A Manifest V3 browser extension for Chrome and Firefox that captures a
bug and files it as a Rewind: a screenshot or a video of the page, with
the page's console, network and user events. It uploads through the
existing `rewinds-api` routes and opens the result in the viewer.

User stories:

- As a reporter, I click the toolbar icon, take a screenshot (now, or
  after 3s or 6s), mark the problem with a box, name it, and get a link.
- As a reporter, I record the current tab, a dragged area of it, or my
  desktop, with or without my microphone. A 3-second countdown runs
  first. I can pause, resume, mute, stop or discard.
- As a reporter who did not press record in time, I turn on instant
  replay and save the last 2 minutes of the tab after the bug happened.
- As a reporter, I trim a recording before I file it, or save it for
  later and find it under Drafts.
- As a developer who opens the Rewind, I see the console output, network
  requests, clicks, inputs and navigations that happened while it was
  captured, on the same timeline as the video.

## UI (from `Rewind.dc.html`)

Four extension pages, all React, all on the design's `--rw-*` tokens and
its Inter and Poppins fonts. The design's `extHome`, `extDrafts`,
`extSettings`, `rec`/`recV` and `editor`/`ed` blocks are the source.

- **Popup, home** (390px): logo `rewind`, the drafts pill (`N draft(s)
unfinished`) when drafts exist, open web app, `•••` menu (Settings,
  Restart extension). Blocks:
  - **Capture screenshot**, with a chevron that shows **Time delay**
    `Off | 3s | 6s`.
  - **Record tab | area | desktop**, a mic `On | Off` chip, and a chevron
    that shows **Record area** (a select: Tab, Area, Desktop) and
    **Microphone** (the device list from `enumerateDevices`).
  - **Save instant replay** · `Last 2 minutes`, only while instant
    replay is on.
  - On a page that is not `http(s)`, the capture blocks are disabled
    with the hint "Open a web page to capture it".
- **Popup, drafts**: back arrow, one row per draft (page, duration or
  "Screenshot", date), **Open**, delete. "No unfinished drafts" when empty.
- **Popup, settings**: a **Rewind** section (web app URL, your name),
  then the design's **General** (Open Rewinds in a new tab, Capture user
  events, Appearance `Light | Dark | System`, Keyboard shortcuts Edit ↗),
  **Instant replay** (the toggle and the "How it works" note) and
  **Troubleshooting** (Reset extension).
- **Recorder** (a small extension window): the design's dark control
  bar: Stop, the countdown ("Recording in 3") or the timer with the
  pulsing dot, Pause/Resume, the mic toggle, Discard. The countdown
  panel ("Preparing to record · Your microphone is ON"; click to pause
  the countdown) sits above it. Desktop mode first shows a **Choose
  what to record** button, because the browser's picker needs a click.
- **Editor** (an extension tab): the design's editor modal as a page.
  Left: the screenshot with a box tool (drag to draw a red box, type an
  optional label, undo), or the video with the trim bar (start and end
  handles, red playhead) and "N seconds". Right: `Create a` **Rewind
  link**, title, "Attached automatically: N events · N errors · N
  network requests", **Create link**. Top left: **Discard** for a
  screenshot, **Save for later** for a video. A name field appears above
  the CTA when settings have no name yet.

Deviations from the design, each because v1 has no accounts or the
module does not own it: no workspace avatar, no Linear or Jira
destination, no description, no AI summary toggle, no attach button, no
draw-during-recording tool, no Docs, Help or Report an issue items, no
"Send error logs to Rewind", no "Create recording link" row (that is
`recording-links`). The design's control bar floats over the page; here
it lives in the recorder window, because desktop recording leaves the
browser and Firefox has no offscreen document to hold a stream.

## Capture

**Events.** Two content scripts on every `http(s)` page, at
`document_start`:

- `capture-main.content.ts` (MAIN world) wraps `console.log/info/debug`
  (`log`), `console.warn` (`warn`), `console.error`, `window` `error` and
  `unhandledrejection` (`err`, `isError`), `fetch` and `XMLHttpRequest`
  (`net`, `isError` on status >= 400 or a failed request), and
  `history.pushState/replaceState` and `popstate` (`nav`). It posts each
  event to the isolated script with `window.postMessage`.
- `capture.content.ts` (ISOLATED world) adds `click`, `input` (on
  `change`) and the initial `nav`, unless **Capture user events** is off
  (then clicks, inputs and navigations are all skipped). It forwards
  every event to the background with `runtime.sendMessage`. It also
  draws the area-selection overlay.

Event text follows the seed data: `Navigated to host/path`,
`Clicked “Label”` (`… field` for form fields), `Typed in “Label” field`,
`GET /api/cart · 200 · 92ms` (`1.2s` from 1000ms, `failed` for a network
error; same-origin URLs as a path). Input values are never captured.
Console arguments are joined with spaces; an `Error` becomes its stack
(or `name: message`), other objects are `JSON.stringify`d and fall back
to `String()`. Text is cut at 10,000 characters.

**Buffer.** The background keeps each tab's events with their absolute
time, for the last 2 minutes, or since that tab's recording started. It
mirrors the buffer to `storage.session` so a restarted service worker
keeps it, drops a tab's buffer when the tab closes, and keeps at most
10,000 events per tab (the schema's cap).

**Media time.** A capture has active spans (a recording's spans between
pauses). An event's `t` is the active time before it, in seconds.
Events outside the spans are dropped. A screenshot's span is its 2-minute
window; a replay's span runs from its first to its last snapshot.

**Screenshot.** The background waits the delay, then
`tabs.captureVisibleTab` (PNG) of the target tab's window, saves a draft,
and opens the editor. If the target tab is no longer the visible tab in
its window (the user switched tabs during the delay), the capture fails
instead of saving another tab's pixels. The editor exports the image with its boxes and
labels drawn in as `image/png`.

**Recording.** The popup opens the recorder window for the target tab.

- Tab and area (Chrome): the popup gets
  `tabCapture.getMediaStreamId({ targetTabId })` inside its click, and
  the recorder opens the stream with `getUserMedia`. Area first asks the
  tab for a rectangle, then crops every frame to it with
  `MediaStreamTrackProcessor` and `VideoFrame`'s `visibleRect`.
- Desktop (Chrome and Firefox): `getDisplayMedia` on the recorder's
  button.
- Firefox has no `tabCapture`, so its popup offers Desktop only.
- The microphone, when on, is a second `getUserMedia` with the chosen
  `deviceId`; its track joins the video track. Muting sets
  `track.enabled = false`. Tab audio is not recorded.
- `MediaRecorder` writes `video/webm`. Pause and resume map to the
  recorder's `pause()` and `resume()`. Stop, the tab closing, or the
  browser's "Stop sharing" ends the capture: the recorder saves a draft
  with the events for its spans and opens the editor. Stop before the
  countdown ends discards instead, since nothing was recorded. Closing
  the recorder window releases the tab's event hold.

**Instant replay.** Off by default. While on, the background takes a
JPEG `captureVisibleTab` of the focused window's active `http(s)` tab
every second and stores it in IndexedDB with the tab id, deleting
snapshots older than 2 minutes. An alarm every 30 seconds restarts the
loop after the worker sleeps. Turning it off deletes every snapshot
and clears the alarm.
**Save instant replay** makes a draft from that tab's snapshots and
events. The editor encodes the snapshots into a `video/webm` at their
real times with Mediabunny (WebCodecs), then treats it as a recording.

**Drafts.** Every capture is a draft in the extension's IndexedDB
(`rewind` database, `captures` and `snapshots` stores) until it is
filed or discarded. The editor reads its draft by id. **Save for later**
and closing the tab keep it; **Discard** and a successful upload delete
it.

## Upload

The editor files a draft in three calls against the web app URL from
settings:

1. `POST /api/uploads` with `{ contentType }`: `image/png` for a
   screenshot, `video/webm` for a video.
2. `PUT` the blob to the returned URL with exactly that `Content-Type`
   header. The URL signs `content-type`, so any other value fails.
3. `POST /api/rewinds` with a body parsed by `createRewind` from
   `@rewind/schema` before it is sent: `title` (default `Screenshot of
host/path` or `Recording of host/path`, cut to the schema's title
   limit), the page `url` (without its hash, cut to the schema's URL
   limit),
   `reporterName`, `kind`, `mediaKey`, `durationSeconds` (videos only),
   and the events.

A video is always remuxed with Mediabunny before upload, which also
applies the trim. MediaRecorder's WebM has no duration or cues, so the
viewer could not seek it otherwise. Events are cut to the trim and
shifted by its start.

On success the editor copies `<app>/r/<id>` to the clipboard, deletes
the draft, and opens the viewer: in a new tab, or in the editor's own
tab when **Open Rewinds in a new tab** is off. On failure it keeps the
draft and shows the error.

Extension pages with host permissions are exempt from CORS, so neither
the web app nor MinIO needs a CORS entry for the extension
(`docker-compose.yml` already says so). No API change.

## Manifest and permissions

`storage`, `tabs`, `alarms`, `unlimitedStorage`, `tabCapture` (Chrome
only), and host permission `<all_urls>` (content scripts on every page,
`captureVisibleTab`, and CORS-free calls to the app and MinIO). Commands:
`screenshot` (`Alt+Shift+S`) and `save-replay` (`Alt+Shift+R`). Firefox
gets `browser_specific_settings.gecko.id` and is built as MV3:
`wxt build -b firefox --mv3`, output `.output/firefox-mv3`.

## Settings

`storage.local` item `local:settings`, typed, with defaults:
`appUrl` `https://rewind-ecru.vercel.app`, `reporterName` `""`,
`openInNewTab` `true`, `captureUserEvents` `true`, `theme` `system`,
`instantReplay` `false`, `delay` `off`, `recordMode` `tab` (`desktop` on
Firefox), `micOn` `true`, `micDeviceId` `default`. **Reset extension**
writes the defaults back. **Restart extension** is `runtime.reload()`.
**Edit ↗** opens the browser's shortcut settings.

## Out of scope

Deferred by the capability map: accounts and workspaces, Linear and Jira
destinations, AI summary, integrations, error-log reporting, docs and
helpdesk. Owned by later modules: the library and dark mode in the web
app (`library`), the recording-link row (`recording-links`). Not
captured: tab audio, device info (browser, OS, viewport), input values,
DOM snapshots.

## Code style

Pure logic in `lib/` with no browser globals where it can avoid them;
entrypoints wire it to `browser.*`, the DOM and React.

```ts
// lib/timeline.ts
export type Span = { start: number; end: number };

/** Seconds of active capture before `at`, or null when `at` is outside every span. */
export function mediaTime(at: number, spans: Span[]): number | null {
  let t = 0;
  for (const s of spans) {
    if (at < s.start) return null;
    if (at <= s.end) return (t + at - s.start) / 1000;
    t += s.end - s.start;
  }
  return null;
}
```

CSS Modules over the `--rw-*` tokens, no Tailwind (`learning/MEMORY.md`).
The tokens come from `apps/web/src/styles/tokens.css`, imported, not
copied, so the two apps share one file.

## Testing strategy

- Unit (Vitest, `fakeBrowser` from `wxt/testing`, `happy-dom` for the
  React pages, `fake-indexeddb` for the drafts store): event text,
  media time, the buffer's trim and cap, settings, drafts, upload (the
  three calls, the exact `Content-Type`, schema rejection), the capture
  scripts' wrappers, the background's message handlers, and every
  page's interactions. 100% coverage, as the rest of the extension.
- Thin browser-only wrappers (`MediaRecorder`, `getDisplayMedia`,
  `getUserMedia`, `MediaStreamTrackProcessor`, Mediabunny, canvas
  export) sit in `lib/media.ts`, mocked in unit tests and proven by the
  e2e below.
- E2E (Playwright, the Chrome build unpacked, against the web app on a
  fresh `e2e.db` and real MinIO):
  - the popup renders home, drafts and settings;
  - screenshot: a fixture page logs to the console and calls `fetch`,
    the test triggers a screenshot, draws a box, files it, and the
    viewer shows the image (not "Media unavailable") and the console
    and network rows;
  - instant replay: on, wait 3 seconds, save, file; the viewer plays a
    video with a duration;
  - recording: desktop mode with Chrome's
    `--auto-select-tab-capture-source-by-title` and fake media devices,
    record 3 seconds, stop, trim, file; the viewer plays it;
  - the Firefox MV3 build passes `web-ext lint`.
- Manual (documented in `docs/extension-manual-check.md`, run before
  release): tab and area recording with Chrome's real `tabCapture`,
  real microphone permission and device choice, and every flow in
  Firefox via `web-ext run`. These need a user gesture on the toolbar
  or a real device, so an automated test of them would prove nothing.

## Boundaries

- Always: build every request body with `@rewind/schema`; send the exact
  signed `Content-Type`; keep TypeScript on 5.9.x; keep snapshots and
  drafts local until the user files them.
- Ask first: any change to the API, the schema or the capability map.
- Never: capture input values; capture on non-`http(s)` pages; send
  anything anywhere except the configured web app and its presigned URL.

## Success criteria

1. `bun run build` produces `chrome-mv3` and `firefox-mv3`, and
   `web-ext lint` passes on the Firefox build.
2. The screenshot e2e files a Rewind whose viewer shows the image and
   the fixture's console and network events.
3. The instant replay and recording e2es file videos the viewer plays,
   with a duration.
4. A saved draft appears in the popup's Drafts and reopens in the editor.
5. `bun run test`, `lint`, `typecheck` and `e2e` exit 0 at 100% coverage.
