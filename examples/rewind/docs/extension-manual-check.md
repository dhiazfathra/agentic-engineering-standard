# Extension manual check

The extension e2e (`bun run --filter extension e2e`) runs screenshot,
instant replay and desktop recording in headless Chromium with fake media
devices, and lints the Firefox build. A few things only a person can
check, because they need a click on the toolbar icon, a real permission
prompt, or a real device. Run these before a release.

## Setup

From `examples/rewind/`, with the web app running (`bun run dev`, or point
**Settings → Web app URL** at the deployed app):

```
bun run --filter extension build
```

- Chrome: `chrome://extensions`, turn on Developer mode, **Load unpacked**,
  pick `apps/extension/.output/chrome-mv3`.
- Firefox: `bunx web-ext run -s apps/extension/.output/firefox-mv3`. MV3
  host permissions are opt-in there, so the popup first shows **Grant
  access**; click it and accept Firefox's prompt.

Open any `http(s)` page, then click the Rewind toolbar icon.

## Chrome

1. **Tab recording.** Record tab, mic Off. The recorder window counts down
   3 seconds, then records. Click around the page, then Stop. The editor
   plays the tab, and **Create link** opens the viewer with the clicks on
   the timeline.
2. **Area recording.** Record area. The page dims; drag a rectangle. The
   recording shows only that rectangle. Escape instead of dragging closes
   the recorder.
3. **Microphone.** Mic On, pick a device under the chevron. Chrome asks for
   microphone access once. The recording has sound. The mic button in the
   recorder mutes and unmutes it.
4. **Pause.** Pause during a recording, wait 5 seconds, Resume. The
   recording's length leaves out the pause, and the events line up with
   the video.
5. **Stop sharing.** In desktop mode, use the browser's "Stop sharing"
   bar. The recording stops and the editor opens.
6. **Shortcuts.** `Alt+Shift+S` takes a screenshot of the active tab.
   With instant replay on, `Alt+Shift+R` saves the last 2 minutes.
   **Settings → Keyboard shortcuts → Edit ↗** opens the shortcut page.
7. **Drafts.** Save a recording for later. The popup's drafts pill counts
   it, and **Open** brings it back to the editor.

## Firefox

Firefox has no `tabCapture`, so it records the desktop only.

1. Before access is granted, the capture blocks are disabled. After
   **Grant access**, they work on the next page load.
2. The popup offers Desktop only, and **Choose what to record** opens
   Firefox's own picker.
3. Screenshot, instant replay and desktop recording each file a Rewind the
   viewer shows, as in Chrome.
4. Microphone: Firefox asks in the recorder window; the recording has
   sound.
