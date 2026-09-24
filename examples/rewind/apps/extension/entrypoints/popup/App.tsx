import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { deleteDraft, listDrafts, type Draft } from "../../lib/drafts";
import { send, type RecordMode } from "../../lib/messages";
import {
  DEFAULTS,
  settings as settingsItem,
  updateSettings,
  resetSettings,
  type Delay,
  type Settings,
} from "../../lib/settings";
import { applyTheme, type Theme } from "../../lib/theme";
import styles from "./popup.module.css";

type View = "home" | "drafts" | "settings";

type MicOption = { deviceId: string; label: string };

/** Firefox has no `tabCapture`, so tab/area recording is Chrome-only. */
function hasTabCapture(): boolean {
  return Boolean((browser as unknown as { tabCapture?: unknown }).tabCapture);
}

/** Firefox MV3 gates `<all_urls>` behind an explicit user grant; Chrome grants it upfront. */
function hostPermissions() {
  return (
    browser as unknown as {
      permissions?: {
        contains(p: { origins: string[] }): Promise<boolean>;
        request(p: { origins: string[] }): Promise<boolean>;
      };
    }
  ).permissions;
}

function isHttpUrl(url: string | undefined): boolean {
  return url !== undefined && /^https?:\/\//.test(url);
}

function parsesAsHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function draftLabel(count: number): string {
  return `${count} draft${count === 1 ? "" : "s"} unfinished`;
}

function hostAndPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function formatDraftDuration(draft: Draft): string {
  if (draft.kind === "screenshot") return "Screenshot";
  if (draft.kind === "replay") return "Replay";
  const seconds = Math.round(draft.durationSeconds ?? 0);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `16 Sep`, matching the design's draft rows. */
function formatDraftDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function openShortcutSettings(): void {
  const commands = browser.commands as unknown as {
    openShortcutSettings?: () => void;
  };
  if (commands.openShortcutSettings) {
    commands.openShortcutSettings();
  } else {
    void browser.tabs.create({ url: "chrome://extensions/shortcuts" });
  }
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.segment}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          className={styles.segmentItem}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shotOpen, setShotOpen] = useState(true);
  const [recOpen, setRecOpen] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<{ id: number; url?: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mics, setMics] = useState<MicOption[]>([]);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [appUrlDraft, setAppUrlDraft] = useState("");
  const [appUrlError, setAppUrlError] = useState<string | null>(null);
  const [hasHostAccess, setHasHostAccess] = useState(true);

  useEffect(() => {
    void settingsItem.getValue().then((s) => {
      setSettings(s);
      setAppUrlDraft(s.appUrl);
      applyTheme(s.theme);
    });
    return settingsItem.watch((next) => {
      setSettings(next);
      applyTheme(next.theme);
    });
  }, []);

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([activeTab]) => {
        if (activeTab?.id != null) {
          setTab({ id: activeTab.id, url: activeTab.url });
        }
      });
  }, []);

  function refreshDrafts() {
    void listDrafts().then(setDrafts);
  }

  useEffect(() => {
    refreshDrafts();
  }, []);

  useEffect(() => {
    void hostPermissions()
      ?.contains({ origins: ["<all_urls>"] })
      .then(setHasHostAccess);
  }, []);

  async function handleGrantAccess() {
    const granted = await hostPermissions()?.request({
      origins: ["<all_urls>"],
    });
    setHasHostAccess(Boolean(granted));
  }

  useEffect(() => {
    if (!recOpen) return;
    void navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === "audioinput");
      setMics(
        inputs.map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        })),
      );
    });
  }, [recOpen]);

  if (settings === null || tab === null) {
    return (
      <div className={styles.popup}>
        <h1 className={styles.logo}>rewind</h1>
      </div>
    );
  }

  const canCapture = isHttpUrl(tab.url) && hasHostAccess;
  const tabCaptureAvailable = hasTabCapture();
  const effectiveMode: RecordMode = tabCaptureAvailable
    ? settings.recordMode
    : "desktop";

  function patch(next: Partial<Settings>) {
    setSettings({ ...settings!, ...next });
    void updateSettings(next);
  }

  async function handleScreenshot() {
    await send({ type: "screenshot", tabId: tab!.id });
    window.close();
  }

  async function handleRecord() {
    const tabId = tab!.id;
    if (effectiveMode === "desktop") {
      await send({ type: "record", tabId, mode: "desktop" });
    } else {
      const streamId = await browser.tabCapture.getMediaStreamId({
        targetTabId: tabId,
      });
      await send({ type: "record", tabId, mode: effectiveMode, streamId });
    }
    window.close();
  }

  async function handleSaveReplay() {
    const result = await send<{ error?: string }>({
      type: "save-replay",
      tabId: tab!.id,
    });
    if (result?.error) {
      setReplayError(result.error);
      return;
    }
    window.close();
  }

  function commitAppUrl(value: string) {
    setAppUrlDraft(value);
    if (!parsesAsHttpUrl(value)) {
      setAppUrlError("Enter a valid http(s) URL");
      return;
    }
    setAppUrlError(null);
    patch({ appUrl: value });
  }

  const recordLabel =
    effectiveMode === "tab"
      ? "Record tab"
      : effectiveMode === "area"
        ? "Record area"
        : "Record desktop";

  return (
    <div className={styles.popup}>
      <div className={styles.header}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 5L3 12l8 7zM21 5l-8 7 8 7z" fill="#01afaf" />
        </svg>
        <h1 className={styles.logo}>rewind</h1>
        {view === "home" && drafts.length > 0 && (
          <button
            type="button"
            className={styles.draftsPill}
            onClick={() => setView("drafts")}
          >
            {draftLabel(drafts.length)}
          </button>
        )}
        {view === "home" && (
          <>
            <button
              type="button"
              title="Open web app"
              aria-label="Open web app"
              className={styles.iconButton}
              onClick={() => void browser.tabs.create({ url: settings.appUrl })}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 11l8-7 8 7v9H4z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="More"
              aria-expanded={menuOpen}
              className={styles.menuButton}
              onClick={() => setMenuOpen((o) => !o)}
            >
              •••
            </button>
            {menuOpen && (
              <div className={styles.menu}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    setView("settings");
                  }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    browser.runtime.reload();
                  }}
                >
                  Restart extension
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {view === "home" && (
        <div className={styles.body}>
          {!hasHostAccess && (
            <div className={`${styles.block} ${styles.notice}`}>
              <span>Rewind needs access to web pages to capture them</span>
              <button
                type="button"
                className={styles.noticeButton}
                onClick={() => void handleGrantAccess()}
              >
                Grant access
              </button>
            </div>
          )}
          {!canCapture && hasHostAccess && (
            <div className={styles.hint}>Open a web page to capture it</div>
          )}
          <div className={styles.block}>
            <div className={styles.blockRow}>
              <button
                type="button"
                className={styles.mainAction}
                disabled={!canCapture}
                onClick={() => void handleScreenshot()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                </svg>
                Capture screenshot
              </button>
              <button
                type="button"
                aria-label="Toggle time delay"
                aria-expanded={shotOpen}
                className={styles.chevron}
                onClick={() => setShotOpen((o) => !o)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {shotOpen && (
              <div className={styles.subRow}>
                <span className={styles.subLabel}>Time delay</span>
                <Segment<Delay>
                  options={[
                    { value: "off", label: "Off" },
                    { value: "3s", label: "3s" },
                    { value: "6s", label: "6s" },
                  ]}
                  value={settings.delay}
                  onChange={(delay) => patch({ delay })}
                />
              </div>
            )}
          </div>

          <div className={styles.block}>
            <div className={styles.blockRow}>
              <button
                type="button"
                className={styles.mainAction}
                disabled={!canCapture}
                onClick={() => void handleRecord()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 4h18v12H3zM8 20h8M12 16v4" />
                </svg>
                {recordLabel}
              </button>
              <button
                type="button"
                className={styles.micChip}
                onClick={() => patch({ micOn: !settings.micOn })}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                {settings.micOn ? "On" : "Off"}
              </button>
              <button
                type="button"
                aria-label="Toggle record options"
                aria-expanded={recOpen}
                className={styles.chevron}
                onClick={() => setRecOpen((o) => !o)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {recOpen && (
              <>
                <div className={styles.subRow}>
                  <span className={styles.subLabel}>Record area</span>
                  {tabCaptureAvailable ? (
                    <select
                      aria-label="Record area"
                      className={styles.select}
                      value={settings.recordMode}
                      onChange={(e) =>
                        patch({ recordMode: e.target.value as RecordMode })
                      }
                    >
                      <option value="tab">Tab</option>
                      <option value="area">Area</option>
                      <option value="desktop">Desktop</option>
                    </select>
                  ) : (
                    <span className={styles.fixedValue}>Desktop</span>
                  )}
                </div>
                <div className={styles.subRow}>
                  <span className={styles.subLabel}>Microphone</span>
                  <select
                    aria-label="Microphone"
                    className={styles.select}
                    value={settings.micDeviceId}
                    onChange={(e) => patch({ micDeviceId: e.target.value })}
                  >
                    <option value="default">Default</option>
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {settings.instantReplay && (
            <div className={styles.block}>
              <div className={styles.blockRow}>
                <button
                  type="button"
                  className={styles.mainAction}
                  disabled={!canCapture}
                  onClick={() => void handleSaveReplay()}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
                  </svg>
                  Save instant replay
                </button>
                <span className={styles.subLabel} style={{ paddingRight: 14 }}>
                  Last 2 minutes
                </span>
              </div>
              {replayError && <div className={styles.error}>{replayError}</div>}
            </div>
          )}
        </div>
      )}

      {view === "drafts" && (
        <>
          <div className={styles.viewHeader}>
            <button
              type="button"
              aria-label="Back"
              className={styles.back}
              onClick={() => setView("home")}
            >
              ←
            </button>
            <span className={styles.viewTitle}>Drafts</span>
          </div>
          <div className={styles.draftsList}>
            {drafts.length === 0 && (
              <div className={styles.emptyState}>No unfinished drafts</div>
            )}
            {drafts.map((draft) => (
              <div className={styles.draftRow} key={draft.id}>
                <div className={styles.draftInfo}>
                  <div className={styles.draftUrl}>
                    {hostAndPath(draft.url)}
                  </div>
                  <div className={styles.draftMeta}>
                    {formatDraftDuration(draft)} ·{" "}
                    {formatDraftDate(draft.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.openButton}
                  onClick={() =>
                    void browser.tabs.create({
                      url: browser.runtime.getURL(
                        `/editor.html?id=${draft.id}`,
                      ),
                    })
                  }
                >
                  Open
                </button>
                <button
                  type="button"
                  title="Delete"
                  aria-label="Delete draft"
                  className={styles.deleteButton}
                  onClick={() => void deleteDraft(draft.id).then(refreshDrafts)}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "settings" && (
        <>
          <div className={styles.viewHeader}>
            <button
              type="button"
              aria-label="Back"
              className={styles.back}
              onClick={() => setView("home")}
            >
              ←
            </button>
            <span className={styles.viewTitle}>Settings</span>
          </div>
          <div className={styles.settingsBody}>
            <div className={styles.sectionTitle}>Rewind</div>
            <div className={styles.row}>
              <label className={styles.rowLabel} htmlFor="rw-app-url">
                Web app URL
              </label>
              <input
                id="rw-app-url"
                type="text"
                className={styles.textInput}
                value={appUrlDraft}
                onChange={(e) => setAppUrlDraft(e.target.value)}
                onBlur={(e) => commitAppUrl(e.target.value)}
              />
            </div>
            {appUrlError && <div className={styles.error}>{appUrlError}</div>}
            <div className={styles.rowNoBorder}>
              <label className={styles.rowLabel} htmlFor="rw-name">
                Your name
              </label>
              <input
                id="rw-name"
                type="text"
                className={styles.textInput}
                value={settings.reporterName}
                onChange={(e) => patch({ reporterName: e.target.value })}
              />
            </div>

            <div className={styles.sectionTitle}>General</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Open Rewinds in a new tab</span>
              <Switch
                label="Open Rewinds in a new tab"
                checked={settings.openInNewTab}
                onChange={(openInNewTab) => patch({ openInNewTab })}
              />
            </div>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <div className={styles.rowLabel} style={{ color: "inherit" }}>
                  Capture user events
                </div>
                <div className={styles.rowSubtitle}>
                  Clicks, navigation and input
                </div>
              </div>
              <Switch
                label="Capture user events"
                checked={settings.captureUserEvents}
                onChange={(captureUserEvents) => patch({ captureUserEvents })}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Appearance</span>
              <Segment<Theme>
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                ]}
                value={settings.theme}
                onChange={(theme) => patch({ theme })}
              />
            </div>
            <div className={styles.rowNoBorder}>
              <span className={styles.rowLabel}>Keyboard shortcuts</span>
              <button
                type="button"
                className={styles.shortcutsButton}
                onClick={openShortcutSettings}
              >
                Edit ↗
              </button>
            </div>

            <div className={styles.sectionTitle}>Instant replay</div>
            <div className={styles.rowNoBorder}>
              <div className={styles.rowText}>
                <div className={styles.rowLabel} style={{ color: "inherit" }}>
                  Enable instant replay
                </div>
                <div className={styles.rowSubtitle}>
                  Capture a bug right after it happens
                </div>
              </div>
              <Switch
                label="Enable instant replay"
                checked={settings.instantReplay}
                onChange={(instantReplay) => patch({ instantReplay })}
              />
            </div>
            <div className={styles.note}>
              <b style={{ color: "var(--rw-ink)" }}>How it works</b>
              <br />
              Rewind keeps the last 2 minutes of snapshots on your computer.
              They stay local and are deleted on a rolling basis.
            </div>

            <div className={styles.sectionTitle}>Troubleshooting</div>
            <div className={styles.rowNoBorder}>
              <div className={styles.rowText}>
                <div className={styles.rowLabel} style={{ color: "inherit" }}>
                  Reset extension
                </div>
                <div className={styles.rowSubtitle}>
                  Restore all settings to default
                </div>
              </div>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() =>
                  void resetSettings().then(() =>
                    setAppUrlDraft(DEFAULTS.appUrl),
                  )
                }
              >
                Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
