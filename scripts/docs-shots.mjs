#!/usr/bin/env node
// Takes the docs screenshots: signs in to the demo company in a private headless
// Chrome, opens each screen in scripts/docs-shots.config.mjs, and writes
// public/docs/shots/<name>.webp plus its size and marked areas to
// components/docs/shots.json (read by <Shot>).
//
//   pnpm docs:shots                 # every shot
//   pnpm docs:shots invoices bills  # just these (names or name prefixes ending in *)
//
// Needs the app running (pnpm dev) with the demo data seeded (pnpm db:seed), and
// Chrome installed. DOCS_SHOTS_BASE, DOCS_SHOTS_EMAIL, DOCS_SHOTS_PASSWORD and
// CHROME_PATH override the defaults.

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { shots } from "./docs-shots.config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/docs/shots");
const MANIFEST = path.join(ROOT, "components/docs/shots.json");
const BASE = process.env.DOCS_SHOTS_BASE ?? "http://localhost:3000";
const EMAIL = process.env.DOCS_SHOTS_EMAIL ?? "demo@dubbl.dev";
const PASSWORD = process.env.DOCS_SHOTS_PASSWORD ?? "password123";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
/** Full-screen shots are saved this wide (1440 CSS px at ~1.1x). */
const FULL_WIDTH = 1600;

// While shooting: no dev overlay, toasts, animations or blinking caret.
const SHOT_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-sonner-toaster] { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }
  ::-webkit-scrollbar { display: none; }
`;

// `--inspect <path> <target>`: print the element a target finds and its ancestors,
// to pick a `closest` for marks and clips.
const inspectAt = process.argv.indexOf("--inspect");
const inspect = inspectAt >= 0 ? { path: process.argv[inspectAt + 1], target: process.argv[inspectAt + 2] } : null;
const wanted = inspect ? [] : process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selected = shots.filter(
  (s) => wanted.length === 0 || wanted.some((w) => (w.endsWith("*") ? s.name.startsWith(w.slice(0, -1)) : s.name === w))
);
if (selected.length === 0) {
  console.error(`No shots match ${wanted.join(", ")}.`);
  process.exit(1);
}
const names = new Set();
for (const s of shots) {
  if (names.has(s.name)) throw new Error(`Duplicate shot name ${s.name}`);
  names.add(s.name);
}

/* ------------------------------------------------------------ browser */

const port = 9400 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(path.join(tmpdir(), "dubbl-shots-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-gpu",
    "--font-render-hinting=none",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);
const cleanup = () => {
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function pageSocket() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome didn't start. Set CHROME_PATH to your Chrome binary.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await pageSocket());
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 0;
const pending = new Map();
let inflight = 0;
let lastNetwork = Date.now();
const requests = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ""}`));
    else resolve(msg.result);
    return;
  }
  // Track fetches so a shot waits for the page's data, not a guess.
  if (msg.method === "Network.requestWillBeSent" && ["Fetch", "XHR"].includes(msg.params.type)) {
    requests.set(msg.params.requestId, msg.params.request.url);
    inflight = requests.size;
    lastNetwork = Date.now();
  } else if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
    if (requests.delete(msg.params.requestId)) {
      inflight = requests.size;
      lastNetwork = Date.now();
    }
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: SCALE, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    try { localStorage.setItem("theme", localStorage.getItem("dubbl-shots-theme") || "light"); } catch {}
    const addStyle = () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(SHOT_CSS)}; document.documentElement.appendChild(s); };
    if (document.documentElement) addStyle(); else document.addEventListener("DOMContentLoaded", addStyle);
  `,
});

/* ------------------------------------------------------------- helpers */

// In-page element lookup: a CSS selector, or "text=Exact label" for the smallest
// visible element whose text is (or starts with) that label.
const FIND = `
  window.__find = (target, within) => {
    const root = within ? (window.__find(within) || document) : document;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    if (!target.startsWith("text=")) return [...root.querySelectorAll(target)].find(visible) || null;
    const text = target.slice(5).trim().toLowerCase();
    let best = null, bestArea = Infinity;
    for (const el of root.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const t = (el.innerText || el.getAttribute("aria-label") || "").trim().toLowerCase();
      if (t !== text && !(t.startsWith(text) && t.length < text.length + 24)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < bestArea) { best = el; bestArea = area; }
    }
    // Prefer the clickable thing that holds the text.
    return best ? (best.closest("button, a, [role=button], [role=tab], [role=menuitem], [role=option], label, summary") || best) : null;
  };
`;

async function navigate(url) {
  // Requests from the page being left never report back; start counting afresh.
  requests.clear();
  inflight = 0;
  await send("Page.navigate", { url });
  await waitFor(`document.readyState === "complete"`, 30000);
  await evaluate(FIND);
}

async function waitFor(expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(`!!(${expression})`)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
}

/** The page has its data: no loaders on screen and the network quiet for a moment. */
async function settle(ms = 600) {
  const start = Date.now();
  while (Date.now() - start < 25000) {
    const busy = await evaluate(`!!document.querySelector('.brand-loader, .animate-pulse:not(.size-1\\\\.5):not(.size-2), [data-slot=skeleton], .org-loader-overlay')`).catch(() => true);
    if (!busy && inflight === 0 && Date.now() - lastNetwork > ms) return;
    await sleep(100);
  }
  const busy = await evaluate(`[...document.querySelectorAll('.brand-loader, .animate-pulse, [data-slot=skeleton], .org-loader-overlay')].map((e) => e.className.slice(0, 60)).join(" | ")`).catch(() => "");
  console.warn(`    (still loading after 25s; taking the shot anyway) ${busy} ${[...requests.values()].join(" ")}`);
}

/** Where an element is on screen. `closest` widens the match to an ancestor (a CSS selector, or a number of levels up). */
async function rectOf(target, within, closest) {
  await evaluate(FIND);
  return evaluate(`(() => {
    let el = window.__find(${JSON.stringify(target)}, ${JSON.stringify(within ?? null)});
    if (!el) return null;
    const up = ${JSON.stringify(closest ?? null)};
    if (typeof up === "number") for (let i = 0; i < up && el.parentElement; i++) el = el.parentElement;
    else if (up) el = el.closest(up) || el;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
}

async function click(target, within) {
  const r = await rectOf(target, within);
  if (!r) throw new Error(`Couldn't find ${target} to click`);
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function hover(target) {
  const r = await rectOf(target);
  if (!r) throw new Error(`Couldn't find ${target} to hover`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + r.width / 2, y: r.y + r.height / 2 });
}

async function typeInto(target, text) {
  if (target) await click(target);
  await send("Input.insertText", { text });
}

const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38 };
async function press(key) {
  const meta = key.startsWith("Meta+");
  const name = meta ? key.slice(5) : key;
  const code = KEYS[name] ?? name.toUpperCase().charCodeAt(0);
  const base = { key: name, code: name.length === 1 ? `Key${name.toUpperCase()}` : name, windowsVirtualKeyCode: code, modifiers: meta ? 4 : 0 };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function run(action) {
  if (action.click) await click(action.click, action.within);
  else if (action.hover) await hover(action.hover);
  else if (action.type !== undefined) await typeInto(action.into, action.type);
  else if (action.press) await press(action.press);
  else if (action.eval) await evaluate(action.eval);
  else if (action.waitFor) {
    await evaluate(FIND);
    if (!(await waitFor(`window.__find(${JSON.stringify(action.waitFor)})`, action.timeout ?? 15000))) throw new Error(`Timed out waiting for ${action.waitFor}`);
  } else if (action.scroll) {
    await evaluate(`(() => { const el = window.__find(${JSON.stringify(action.scroll)}); el && el.scrollIntoView({ block: ${JSON.stringify(action.block ?? "start")} }); })()`);
  }
  await sleep(action.wait ?? 350);
  if (action.settle !== false) await settle(400);
}

/* --------------------------------------------------------------- sign in */

await navigate(`${BASE}/sign-in`);
const signedIn = await evaluate(`(async () => {
  const { csrfToken } = await (await fetch("/api/auth/csrf")).json();
  const body = new URLSearchParams({ csrfToken, email: ${JSON.stringify(EMAIL)}, password: ${JSON.stringify(PASSWORD)}, callbackUrl: "/dashboard", json: "true" });
  const res = await fetch("/api/auth/callback/credentials", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const session = await (await fetch("/api/auth/session")).json();
  return !!session?.user;
})()`);
if (!signedIn) throw new Error(`Couldn't sign in as ${EMAIL}. Is the demo data seeded (pnpm db:seed)?`);
await navigate(`${BASE}/dashboard`);
await settle();

if (inspect) {
  await navigate(`${BASE}${inspect.path}`);
  await settle();
  const chain = await evaluate(`(() => {
    const out = [];
    let el = window.__find(${JSON.stringify(inspect.target)});
    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      const r = el.getBoundingClientRect();
      out.push(\`up \${i}: <\${el.tagName.toLowerCase()}\${el.id ? " #" + el.id : ""}\${el.getAttribute("role") ? " role=" + el.getAttribute("role") : ""}\${el.dataset.shell ? " data-shell=" + el.dataset.shell : ""}> \${Math.round(r.width)}x\${Math.round(r.height)} at \${Math.round(r.x)},\${Math.round(r.y)}  .\${String(el.className).split(" ").slice(0, 8).join(".")}\`);
    }
    return out.join("\\n");
  })()`);
  console.log(chain || `Nothing matches ${inspect.target} on ${inspect.path}`);
  ws.close();
  process.exit(0);
}

/* ----------------------------------------------------------------- shoot */

mkdirSync(OUT_DIR, { recursive: true });
const results = {};
let failures = 0;

for (const shot of selected) {
  const label = `${shot.name.padEnd(34)} ${shot.path}`;
  try {
    const theme = shot.theme ?? "light";
    await evaluate(`localStorage.setItem("dubbl-shots-theme", ${JSON.stringify(theme)})`);
    const viewport = { ...VIEWPORT, ...shot.viewport };
    await send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: SCALE, mobile: false });
    await navigate(`${BASE}${shot.path}`);
    await settle();
    // `follow`: open the first link on the page whose path matches, e.g. a list's first record.
    if (shot.follow) {
      // `followText`: only a link whose row mentions this text (e.g. "Overdue").
      const href = await evaluate(`(() => {
        const re = new RegExp(${JSON.stringify(shot.follow)});
        const text = ${JSON.stringify(shot.followText ?? null)};
        const row = (a) => a.closest("tr, [role=row], li") || a.parentElement?.parentElement || a;
        const a = [...document.querySelectorAll("a[href]")].find((a) => re.test(new URL(a.href).pathname) && (!text || row(a).innerText.includes(text)));
        return a ? new URL(a.href).pathname : null;
      })()`);
      if (!href) throw new Error(`No link on ${shot.path} matches ${shot.follow}`);
      await navigate(`${BASE}${href}`);
      await settle();
    }
    for (const action of shot.actions ?? []) await run(action);
    await settle(shot.settle ?? 500);
    await sleep(250);

    // What to capture: the viewport, or one element with some breathing room.
    let clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    if (shot.clip) {
      const r = await rectOf(shot.clip, null, shot.clipClosest);
      if (!r) throw new Error(`Couldn't find ${shot.clip} to clip to`);
      const pad = shot.padding ?? 0;
      const x = Math.max(0, r.x - pad);
      const y = Math.max(0, r.y - pad);
      clip = { x, y, width: Math.min(viewport.width - x, r.width + pad * 2), height: Math.min(viewport.height - y, r.height + pad * 2) };
    }

    // Marked areas, as percentages of the captured image.
    const marks = [];
    for (const mark of shot.marks ?? []) {
      const r = await rectOf(mark.target, mark.within, mark.closest);
      if (!r) throw new Error(`Couldn't find mark ${mark.target}`);
      const pad = mark.padding ?? 4;
      // Kept inside the image, so an outline never runs off its edge.
      const left = Math.max(0, r.x - pad - clip.x);
      const top = Math.max(0, r.y - pad - clip.y);
      const right = Math.min(clip.width, r.x + r.width + pad - clip.x);
      const bottom = Math.min(clip.height, r.y + r.height + pad - clip.y);
      marks.push({
        x: round((left / clip.width) * 100),
        y: round((top / clip.height) * 100),
        w: round(((right - left) / clip.width) * 100),
        h: round(((bottom - top) / clip.height) * 100),
        label: mark.label,
      });
    }

    const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
    let image = sharp(Buffer.from(data, "base64"));
    const width = shot.clip ? Math.min(Math.round(clip.width * SCALE), FULL_WIDTH) : Math.round((FULL_WIDTH * viewport.width) / VIEWPORT.width);
    image = image.resize({ width });
    const file = path.join(OUT_DIR, `${shot.name}.webp`);
    const info = await image.webp({ quality: 86, effort: 5 }).toFile(file);
    results[shot.name] = { width: info.width, height: info.height, ...(marks.length ? { marks } : {}) };
    console.log(`ok   ${label}  ${info.width}x${info.height}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${label}\n     ${err.message}`);
  }
}

// Several runs can finish at once: merge into the manifest under a lock, in a
// stable order so diffs stay small.
const lock = `${MANIFEST}.lock`;
for (let i = 0; ; i++) {
  try {
    mkdirSync(lock);
    break;
  } catch {
    if (i > 200) rmSync(lock, { recursive: true, force: true });
    await sleep(50);
  }
}
try {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  Object.assign(manifest, results);
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
} finally {
  rmSync(lock, { recursive: true, force: true });
}
ws.close();
console.log(`\n${selected.length - failures} of ${selected.length} shots saved to public/docs/shots.`);
process.exit(failures ? 1 : 0);

function round(n) {
  return Math.round(n * 100) / 100;
}
