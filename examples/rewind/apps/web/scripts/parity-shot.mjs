// Screenshots one design state and the matching app route at the same size,
// plus a side-by-side comparison image, for docs/parity-audit.md.
//
// node scripts/parity-shot.mjs <out-dir> <name> '<design-state-json>' <app-path> [--dark] [--app-js '<js>'] [--design-js '<js>']
//
// Env: DESIGN_URL (default http://localhost:8766/Rewind.dc.html, served from
// docs/design), APP_URL (default http://localhost:3400), LOGIN_EMAIL and
// LOGIN_PASSWORD (default: the local seed login). An app path of "-" skips the app.
//
// The design draws the app inside a fake browser frame: 14px padding and a
// 46px chrome bar. The app is shot at the frame's inner size and the design
// is cropped to it, so the two images line up pixel for pixel.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [outDir, name, stateJson = "{}", appPath = "-", ...rest] =
  process.argv.slice(2);
if (!outDir || !name) {
  console.error(
    "usage: parity-shot.mjs <out-dir> <name> '<state-json>' <app-path> [--dark] [--app-js js] [--design-js js]",
  );
  process.exit(2);
}
const flag = (f) => {
  const i = rest.indexOf(f);
  return i === -1 ? undefined : rest[i + 1];
};
const dark = rest.includes("--dark");
const DESIGN = process.env.DESIGN_URL ?? "http://localhost:8766/Rewind.dc.html";
const APP = process.env.APP_URL ?? "http://localhost:3400";
const W = 1440,
  H = 900,
  PAD = 14,
  CHROME = 46;
const inner = { width: W - 2 * PAD, height: H - 2 * PAD - CHROME };
const out = resolve(outDir);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];

const d = await browser.newPage({ viewport: { width: W, height: H } });
d.on("pageerror", (e) => errors.push(`design: ${e.message}`));
await d.goto(DESIGN);
await d.waitForTimeout(2000);
await d.evaluate(
  ({ state, dark }) => {
    for (const el of document.querySelectorAll("body *")) {
      const k = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      if (!k) continue;
      for (let f = el[k]; f; f = f.return) {
        if (f.stateNode?.logic) {
          window.__rw = f.stateNode.logic;
          window.__rw.setState({ ...state, ...(dark ? { dark: true } : {}) });
          if (dark) document.body.classList.add("rw-dark");
          return;
        }
      }
    }
    throw new Error("design logic not found");
  },
  { state: JSON.parse(stateJson), dark },
);
await d.waitForTimeout(600);
if (flag("--design-js")) {
  await d.evaluate(flag("--design-js"));
  await d.waitForTimeout(400);
}
const designPng = join(out, `${name}-design.png`);
await d.screenshot({
  path: designPng,
  clip: { x: PAD, y: PAD + CHROME, ...inner },
});

let appPng;
if (appPath !== "-") {
  const ctx = await browser.newContext({ viewport: inner });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(`app: ${e.message}`));
  a.on(
    "console",
    (m) => m.type() === "error" && errors.push(`app console: ${m.text()}`),
  );
  const res = await ctx.request.post(`${APP}/api/auth/login`, {
    data: {
      email: process.env.LOGIN_EMAIL ?? "dhiazfathra@gmail.com",
      password: process.env.LOGIN_PASSWORD ?? "rewind-dev",
    },
  });
  if (!res.ok()) errors.push(`app login: ${res.status()}`);
  if (dark)
    await a.addInitScript(() => localStorage.setItem("rewind-theme", "dark"));
  await a.goto(APP + appPath);
  await a.waitForLoadState("networkidle");
  if (flag("--app-js")) {
    await a.evaluate(flag("--app-js"));
    await a.waitForTimeout(400);
  }
  appPng = join(out, `${name}-app.png`);
  await a.screenshot({ path: appPng });
  await ctx.close();

  const c = await browser.newPage({
    viewport: { width: inner.width * 2 + 8, height: inner.height + 28 },
  });
  const img = (p, label) =>
    `<figure style="margin:0"><figcaption style="font:12px monospace;height:24px">${label}</figcaption><img src="data:image/png;base64,${readFileSync(p).toString("base64")}" width="${inner.width}" height="${inner.height}"></figure>`;
  await c.setContent(
    `<body style="margin:0;display:flex;gap:8px;background:#f0f">${img(designPng, `design: ${name}`)}${img(appPng, `app: ${appPath}`)}</body>`,
  );
  await c.waitForTimeout(300);
  await c.screenshot({ path: join(out, `${name}-compare.png`) });
}

await browser.close();
console.log(JSON.stringify({ design: designPng, app: appPng ?? null, errors }));
