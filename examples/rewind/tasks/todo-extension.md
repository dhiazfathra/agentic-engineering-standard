# Tasks: extension

Plan: `plan-extension.md`. Spec: `../SPEC-extension.md`. All paths are
under `apps/extension/` and all commands run from `examples/rewind/`
unless a task says otherwise. Prefix commands that run Node with
`. ~/.nvm/nvm.sh && nvm use >/dev/null`. The design is
`docs/design/Rewind.dc.html` (blocks `extHome`, `extDrafts`,
`extSettings`, `rec`, `editor`, around lines 679-798).

## T1: Setup

- [x] Dependencies (`bun add` in `apps/extension`, pinned exact):
      `@rewind/schema` (`workspace:*`), `mediabunny`,
      `@fontsource-variable/inter`, `@fontsource/poppins`; dev:
      `happy-dom` (same version as `apps/web`), `fake-indexeddb`.
- [x] `wxt.config.ts`: manifest as a function of the browser: name
      Rewind, permissions `storage tabs alarms unlimitedStorage`, plus
      `tabCapture` on Chrome; `host_permissions: ["<all_urls>"]`;
      `commands` `screenshot` (`Alt+Shift+S`) and `save-replay`
      (`Alt+Shift+R`); Firefox `browser_specific_settings.gecko.id`
      `rewind@rewind.dev`.
- [x] `package.json` `build`: `wxt build && wxt build -b firefox --mv3`;
      `dev:firefox`: `wxt -b firefox --mv3`. The popup e2e's Firefox
      check reads `.output/firefox-mv3/manifest.json` and asserts
      `manifest_version` 3.
- [x] `styles/base.css`: `@import` the web app's tokens
      (`../../web/src/styles/tokens.css`), the two font packages, and
      `:root { --font-inter: "Inter Variable"; --font-poppins: "Poppins"; }`.
      `lib/theme.ts`: `applyTheme(theme)` toggles `body.rw-dark`
      (`system` follows `prefers-color-scheme`).
- [x] `vitest.config.mts`: coverage over `entrypoints/**` and `lib/**`,
      excluding each page's `main.tsx` bootstrap; `setupFiles` loads
      `fake-indexeddb/auto`.

**Dependencies:** None · **Scope:** S

## T2: `lib/` pure modules

- [x] `lib/messages.ts`: the types in `plan-extension.md` and a typed
      `send(message)` over `browser.runtime.sendMessage`.
- [x] `lib/timeline.ts`: `Span`, `mediaTime(at, spans)` (spec's code
      style), `spanSeconds(spans)`, `toRewindEvents(captured, spans)`
      (drops events outside spans, sorts by `t`, cuts text to 10,000,
      keeps at most 10,000), `trimEvents(events, start, end)` (keeps
      `start <= t <= end`, shifts by `-start`).
- [x] `lib/events.ts`: `formatDuration(ms)` (`92ms`, `1.2s`),
      `formatRequest(method, url, status | null, ms, pageOrigin)`,
      `formatArgs(args)`, `describeElement(el)` (aria-label, label text,
      innerText, placeholder, name, then tag; 60 chars), `clickText(el)`,
      `inputText(el)`, `navText(url)`, `isFormField(el)`, `event(kind,
text, isError?)` stamping `at: Date.now()`.
- [x] `lib/buffer.ts`: `REPLAY_MS = 120_000`, `MAX_EVENTS = 10_000`,
      `trim(events, now, holdSince)` (keeps events newer than
      `now - REPLAY_MS` or `holdSince`, then the newest `MAX_EVENTS`).
- [x] `lib/settings.ts`: `settings = storage.defineItem<Settings>("local:settings", { fallback: DEFAULTS })`,
      `DEFAULTS` per the spec, `updateSettings(patch)`, `resetSettings()`.
      The popup forces Desktop on Firefox through `effectiveMode`.
- [x] `lib/drafts.ts`: `Draft` per the plan; `putDraft`, `getDraft`,
      `listDrafts` (newest first), `deleteDraft`; `putSnapshot({tabId,
at, blob})`, `snapshotsFor(tabId, since)`, `pruneSnapshots(before)`,
      `clearSnapshots()`. One `rewind` database, version 1, stores
      `captures` (key `id`) and `snapshots` (autoincrement, index `at`).
- [x] `lib/upload.ts`: `fileDraft({ appUrl, blob, contentType, rewind })`:
      parses `rewind` with `createRewind` first (throws on invalid),
      `POST /api/uploads`, `PUT` with `Content-Type: contentType` exactly,
      `POST /api/rewinds`; returns `{ id, viewerUrl }`; throws an
      `Error` naming the step and status on any non-2xx.
      `defaultTitle(kind, url)`: `Screenshot of host/path` or
      `Recording of host/path`.
- [x] Unit tests for every function and branch.

**Dependencies:** T1 · **Scope:** M

### Checkpoint A

- [x] `bun run --filter extension test` at 100%, `lint` and `typecheck` exit 0
- [x] Commit

## T3: Content scripts

- [x] `entrypoints/capture-main.content.ts`: `matches: ["http://*/*",
"https://*/*"]`, `world: "MAIN"`, `runAt: "document_start"`. Wraps
      console, `error`/`unhandledrejection`, `fetch`, XHR, history. Each
      wrapper calls the original and never throws into the page. Posts
      `{ source: "rewind", event }`. Logic lives in exported functions
      (`installConsole(win, post)`, `installNetwork(win, post)`,
      `installHistory(win, post)`, `installErrors(win, post)`) so tests
      call them on a happy-dom window.
- [x] `entrypoints/capture.content.ts`: same matches, ISOLATED,
      `document_start`. Forwards MAIN events (checks `source` and
      `event.source === window`) with `send({ type: "event" })`. Adds
      `click` (capture phase) and `change` listeners and the first `nav`
      when `captureUserEvents` is on (watches the setting). Answers
      `select-area` with an overlay in a shadow root: dim the page,
      drag a rectangle, Enter or mouseup confirms, Escape cancels
      (`null`). Returns CSS px plus `viewportWidth`.
- [x] Tests on happy-dom: every wrapper's text and `isError`, the
      fallback when `JSON.stringify` throws, failed fetch, XHR status,
      the user-event toggle, the area overlay (confirm and cancel).

**Dependencies:** T2 · **Scope:** M

## T4: Background

- [x] `entrypoints/background.ts` wires `runtime.onMessage`,
      `tabs.onRemoved`, `commands.onCommand`, `alarms.onAlarm`,
      `storage` changes to handlers in `lib/background/*.ts`:
  - `buffer.ts`: per-tab `Map`, `add(tabId, event)`, `eventsFor(tabId,
spans)` via `toRewindEvents`, `hold(tabId, since)`, `drop(tabId)`,
    loaded from and saved (debounced 1s) to `storage.session`.
  - `screenshot.ts`: waits `delay` seconds, `tabs.get(tabId)` for the
    `windowId` and `url`, `tabs.captureVisibleTab(windowId, { format:
"png" })`, a draft with the last 2 minutes' events (span `[max(first
event, now - REPLAY_MS), now]`), then `tabs.create` the editor
    (`/editor.html?id=<draftId>`).
  - `recorder.ts`: `windows.create({ type: "popup", url:
"/recorder.html?tab=..&mode=..&stream=..", width: 420, height: 260 })`.
  - `replay.ts`: `start()`/`stop()` a 1s loop capturing the focused
    window's active `http(s)` tab as JPEG (quality 60) into
    `putSnapshot`, pruning older than 2 minutes; ignores capture errors;
    `alarms.create("replay", { periodInMinutes: 0.5 })` restarts it;
    turning the setting off stops and `clearSnapshots()`. `save(tabId)`
    builds a `replay` draft from that tab's snapshots and events (span
    first to last snapshot + 1s) and opens the editor; with no
    snapshots, it opens nothing and returns `{ error }`.
- [x] Commands: `screenshot` and `save-replay` act on the active tab.
- [x] Tests with `fakeBrowser` (stub `captureVisibleTab` and
      `windows.create`), fake timers for the delay and the loop.

**Dependencies:** T2 · **Scope:** M

### Checkpoint B

- [x] Tests at 100%; `bun run --filter extension build` produces
      `chrome-mv3` and `firefox-mv3`
- [x] Commit

## T5: Popup

- [x] `entrypoints/popup/App.tsx` + `popup.module.css`: home, drafts,
      settings per the spec's UI section and the design's markup and
      spacing. Reads the active tab (`tabs.query({ active: true,
currentWindow: true })`); disables capture on non-`http(s)` pages.
      Screenshot sends `screenshot` then `window.close()`. Record: for
      tab/area gets `browser.tabCapture.getMediaStreamId({ targetTabId })`
      inside the click, then sends `record`. Firefox (`!browser.tabCapture`)
      shows Desktop only. Mic list from `navigator.mediaDevices.enumerateDevices()`
      (`audioinput`; label fallback `Microphone N`). Drafts pill and view
      from `listDrafts`; Open opens the editor tab; delete removes it.
      Settings view edits every field in `Settings`; Reset writes
      defaults; Restart calls `runtime.reload()`; Edit ↗ calls
      `commands.openShortcutSettings()` when present, else opens
      `chrome://extensions/shortcuts`. Open web app opens `appUrl`.
      Applies the theme.
- [x] DOM tests (happy-dom, `react-dom/client`, `act`, as
      `apps/web/src/app/r/[id]/viewer.test.tsx` does) for every control.

**Dependencies:** T2, T4 message types · **Scope:** M

## T6: `lib/media.ts` and the recorder

- [x] `lib/media.ts`: `openTabStream(streamId)`, `openDisplayStream()`,
      `openMic(deviceId)`, `cropTrack(track, rect)` (processor + generator,
      even-aligned `visibleRect` scaled by `videoWidth / viewportWidth`),
      `startRecorder(stream)` → `{ pause, resume, stop(): Promise<Blob> }`
      (MediaRecorder, `video/webm`, 1s timeslice), `remux(blob, trim?)` →
      `{ blob, durationSeconds }` (Mediabunny `Conversion`, WebM out),
      `encodeFrames(frames)` → `{ blob, durationSeconds }` (Mediabunny,
      each frame shown until the next, the last for 1s), `exportImage(img,
boxes)` → PNG `Blob` with the boxes and labels drawn in at natural
      size. Excluded from unit coverage only if Vitest cannot load
      Mediabunny; otherwise tested with mocks.
- [x] `entrypoints/recorder/` (`index.html`, `main.tsx`, `Recorder.tsx`,
      `recorder.module.css`): reads `tab`, `mode`, `stream` from the URL.
      Tab/area opens the stream at once (area asks the background, which
      focuses the tab and sends `select-area`; `null` closes the window).
      Desktop shows **Choose what to record**. Then the mic (if on), the
      3s countdown (click pauses), `recording` with `since`, the timer
      over the spans. Controls: Stop, Pause/Resume, mic, Discard. A
      track `ended` event stops. Stop saves a `video` draft with
      `send({ type: "events" })` for the spans, clears the hold, opens
      the editor, `window.close()`. Discard clears the hold and closes.
- [x] DOM tests with `lib/media.ts` mocked.

**Dependencies:** T2, T4 · **Scope:** L

## T7: Editor

- [x] `entrypoints/editor/` (`index.html`, `main.tsx`, `Editor.tsx`,
      `editor.module.css`): loads the draft from `?id=`; a missing draft
      shows "This draft no longer exists". A `replay` draft is encoded
      with `encodeFrames` first ("Preparing replay…"), then saved back as
      a `video` draft. Screenshot: box tool (drag draws, label input,
      Undo), exported with `exportImage`. Video: `<video>` preview, trim
      bar (start/end handles, playhead), "N seconds". Right panel per
      the spec. Create link: name check, `remux` with the trim for
      video, `trimEvents`, `fileDraft`, clipboard, `deleteDraft`, open
      the viewer per `openInNewTab`; errors keep the draft and show the
      message. Save for later closes the tab; Discard deletes the draft
      and closes the tab.
- [x] DOM tests with `lib/media.ts` and `lib/upload.ts` mocked.

**Dependencies:** T2, T6 · **Scope:** L

### Checkpoint C

- [x] Tests at 100%, lint, typecheck and build clean
- [x] Commit

## T8: E2E

- [x] `playwright.config.ts`: a `webServer` that runs the web app like
      `apps/web/playwright.config.ts` (fresh `e2e.db`, migrate, seed,
      build, start) on port 3200, honoring a real `S3_ENDPOINT`;
      Chromium with the extension, `--use-fake-ui-for-media-stream`,
      `--use-fake-device-for-media-stream`, and
      `--auto-select-tab-capture-source-by-title=Rewind fixture`. A
      fixture that launches the context, finds the extension id, and
      sets `appUrl` and `reporterName` in `storage.local` via the
      service worker.
- [x] A fixture page (a route served by the test with `context.route`
      on `http://fixture.test/`) titled `Rewind fixture` that logs,
      warns, and `fetch`es the web app's `/api/health`.
- [x] Specs per the spec's testing strategy: popup views, screenshot
      to viewer, instant replay to viewer, desktop recording to viewer,
      Firefox `web-ext lint` on `.output/firefox-mv3`.
- [x] If a flow cannot run headless, remove its spec, say why in the
      manual check doc, and report it.

**Dependencies:** T3-T7 · **Scope:** M

## T9: Docs

- [x] `docs/extension-manual-check.md`: load unpacked in Chrome, tab
      and area recording with real `tabCapture`, microphone prompt and
      device choice, and each flow in Firefox via `bunx web-ext run -s
apps/extension/.output/firefox-mv3`.
- [x] `docs/STACK.md`: extension structure (entrypoints, `lib/`), the
      Firefox MV3 output, the e2e's web server and port.
- [x] `learning/MEMORY.md` line for the extension.

**Dependencies:** T8 · **Scope:** XS

### Checkpoint: Complete

- [x] The five success criteria in `SPEC-extension.md` hold, with evidence
- [x] `/security-review`, `/performance`, `/documentation-and-adrs`
- [x] The learn skill updates `learning/`
