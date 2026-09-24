import { storage } from "wxt/utils/storage";
import type { RecordMode } from "./messages";
import type { Theme } from "./theme";

export type Delay = "off" | "3s" | "6s";

export type Settings = {
  appUrl: string;
  reporterName: string;
  openInNewTab: boolean;
  captureUserEvents: boolean;
  theme: Theme;
  instantReplay: boolean;
  delay: Delay;
  recordMode: RecordMode;
  micOn: boolean;
  micDeviceId: string;
};

export const DEFAULTS: Settings = {
  appUrl: "https://rewind-ecru.vercel.app",
  reporterName: "",
  openInNewTab: true,
  captureUserEvents: true,
  theme: "system",
  instantReplay: false,
  delay: "off",
  recordMode: "tab",
  micOn: true,
  micDeviceId: "default",
};

/** Firefox has no `tabCapture`, so it defaults to desktop recording. */
export function defaultsFor(hasTabCapture: boolean): Settings {
  return hasTabCapture ? DEFAULTS : { ...DEFAULTS, recordMode: "desktop" };
}

export const settings = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULTS,
});

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await settings.getValue();
  await settings.setValue({ ...current, ...patch });
}

export async function resetSettings(): Promise<void> {
  await settings.setValue(DEFAULTS);
}
