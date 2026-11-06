import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  net,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
} from "electron";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import {
  CLOUD_URL,
  getServerUrl,
  getWindowState,
  normalizeServerUrl,
  setServerUrl,
  setWindowState,
} from "./settings";
import { buildMenu } from "./menu";

const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";

const PRELOAD = path.join(__dirname, "preload.js");
const STATIC = path.join(__dirname, "..", "static");

// Sign-in providers and checkout run inside the app window; everything else
// off-site opens in the default browser.
const IN_APP_HOSTS = [
  "accounts.google.com",
  "appleid.apple.com",
  "checkout.stripe.com",
  "billing.stripe.com",
];

// Google refuses to sign in "embedded browsers" it recognises by user agent,
// so present as the Chrome this is.
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|dubbl)\/\S+/g, "");

let mainWindow: BrowserWindow | null = null;

function serverOrigin(): string | null {
  const url = getServerUrl();
  return url ? normalizeServerUrl(url) : null;
}

function isAppUrl(url: string): boolean {
  const origin = serverOrigin();
  try {
    return !!origin && new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isInAppHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return IN_APP_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function windowChrome(): BrowserWindowConstructorOptions {
  if (isMac) {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: 30 },
      vibrancy: "sidebar",
      visualEffectState: "followWindow",
      backgroundColor: "#00000000",
    };
  }
  if (isWindows) {
    return { backgroundMaterial: "mica", autoHideMenuBar: true, backgroundColor: "#00000000" };
  }
  return { autoHideMenuBar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? "#050505" : "#F5F5F3" };
}

/** Restore the last window size and position, as long as it's still on a screen. */
function initialBounds() {
  const saved = getWindowState();
  const fallback = { width: 1380, height: 880 };
  if (!saved) return { ...fallback, maximized: false };
  const visible =
    saved.x !== undefined &&
    saved.y !== undefined &&
    screen.getAllDisplays().some(({ workArea: a }) => {
      return saved.x! < a.x + a.width && saved.x! + saved.width > a.x && saved.y! < a.y + a.height && saved.y! + saved.height > a.y;
    });
  return visible ? saved : { width: saved.width, height: saved.height, maximized: saved.maximized };
}

function createWindow() {
  const bounds = initialBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    title: "dubbl",
    ...windowChrome(),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });
  mainWindow = win;
  if (bounds.maximized) win.maximize();

  win.once("ready-to-show", () => win.show());

  const saveBounds = () => {
    if (win.isDestroyed() || win.isFullScreen()) return;
    setWindowState({ ...win.getNormalBounds(), maximized: win.isMaximized() });
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("close", saveBounds);
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.on("enter-full-screen", () => win.webContents.send("desktop:fullscreen", true));
  win.on("leave-full-screen", () => win.webContents.send("desktop:fullscreen", false));

  guardNavigation(win);
  loadApp(win);
  return win;
}

function guardNavigation(win: BrowserWindow) {
  const contents = win.webContents;

  contents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://") || isAppUrl(url) || isInAppHost(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  // New windows: our own pages (PDFs, previews) get a plain child window.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
        },
      };
    }
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // The server is down or the network is gone: show the offline screen.
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a redirect */) return;
    if (url.startsWith("file://")) return;
    console.warn(`Failed to load ${url}: ${description} (${code})`);
    win.loadFile(path.join(STATIC, "offline.html"), { query: { url } });
  });
}

function loadApp(win: BrowserWindow, pathname = "/dashboard") {
  const origin = serverOrigin();
  if (!origin) {
    win.loadFile(path.join(STATIC, "connect.html"));
    return;
  }
  win.loadURL(`${origin}${pathname}`);
}

function showConnect(win: BrowserWindow) {
  win.loadFile(path.join(STATIC, "connect.html"), { query: { change: "1" } });
}

/** Navigate the app to a dashboard path (used by the menu). */
export function go(pathname: string) {
  const win = mainWindow ?? createWindow();
  if (win.isMinimized()) win.restore();
  win.focus();
  const origin = serverOrigin();
  if (!origin) return;
  const current = win.webContents.getURL();
  if (isAppUrl(current)) {
    // Let the web app route client-side so the shell doesn't reload.
    win.webContents
      .executeJavaScript(
        `window.next && window.next.router ? window.next.router.push(${JSON.stringify(pathname)}) : (location.href = ${JSON.stringify(pathname)})`
      )
      .catch(() => win.loadURL(`${origin}${pathname}`));
  } else {
    win.loadURL(`${origin}${pathname}`);
  }
}

export function changeServer() {
  const win = mainWindow ?? createWindow();
  showConnect(win);
}

export function openDocs() {
  shell.openExternal(`${serverOrigin() ?? CLOUD_URL}/docs`);
}

/** Check a server answers like dubbl before switching to it. */
async function probe(origin: string): Promise<string | null> {
  try {
    const res = await net.fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return `The server answered with ${res.status}.`;
    return null;
  } catch {
    return "Couldn't reach that server. Check the address and your connection.";
  }
}

function registerIpc() {
  ipcMain.on("desktop:version", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle("desktop:is-fullscreen", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  ipcMain.on("desktop:set-theme", (_event, theme: unknown) => {
    if (theme === "light" || theme === "dark" || theme === "system") nativeTheme.themeSource = theme;
  });

  // Connect/offline screens only: they're the bundled file:// pages.
  const fromBundledPage = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
    event.senderFrame?.url.startsWith("file://") ?? false;

  ipcMain.handle("connect:current", (event) => {
    if (!fromBundledPage(event)) return null;
    return { serverUrl: serverOrigin() ?? undefined, cloudUrl: CLOUD_URL };
  });

  ipcMain.handle("connect:submit", async (event, raw: unknown) => {
    if (!fromBundledPage(event) || typeof raw !== "string") return { ok: false, error: "Not allowed." };
    const origin = normalizeServerUrl(raw);
    if (!origin) return { ok: false, error: "That doesn't look like a server address." };
    const problem = await probe(origin);
    if (problem) return { ok: false, error: problem };
    setServerUrl(origin);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) loadApp(win);
    return { ok: true };
  });

  ipcMain.on("connect:retry", (event) => {
    if (!fromBundledPage(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) loadApp(win);
  });

  ipcMain.on("connect:change", (event) => {
    if (!fromBundledPage(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) showConnect(win);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerIpc();
    buildMenu({ go, changeServer, openDocs, reload: () => mainWindow?.webContents.reload() });
    createWindow();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => console.warn("Update check failed", err));
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
}
