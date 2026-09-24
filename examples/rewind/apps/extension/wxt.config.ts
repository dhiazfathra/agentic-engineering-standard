import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Rewind",
    permissions: [
      "storage",
      "tabs",
      "alarms",
      "unlimitedStorage",
      ...(browser === "chrome" ? (["tabCapture"] as const) : []),
    ],
    host_permissions: ["<all_urls>"],
    commands: {
      screenshot: {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Capture a screenshot",
      },
      "save-replay": {
        suggested_key: { default: "Alt+Shift+R" },
        description: "Save instant replay",
      },
    },
    ...(browser === "firefox"
      ? { browser_specific_settings: { gecko: { id: "rewind@rewind.dev" } } }
      : {}),
  }),
});
