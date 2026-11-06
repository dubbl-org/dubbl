import { contextBridge, ipcRenderer } from "electron";

// Runs before the page's own scripts in every window. Marks <html> so the web
// app's CSS can clear the shell backdrop (letting the native material through)
// and make room for the macOS traffic lights.

const platform =
  process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";

function markDocument() {
  const html = document.documentElement;
  if (!html) return false;
  html.dataset.desktop = platform;
  return true;
}

if (!markDocument()) {
  const observer = new MutationObserver(() => {
    if (markDocument()) observer.disconnect();
  });
  observer.observe(document, { childList: true });
}

function setFullscreen(on: boolean) {
  const html = document.documentElement;
  if (!html) return;
  if (on) html.dataset.fullscreen = "";
  else delete html.dataset.fullscreen;
}

ipcRenderer.on("desktop:fullscreen", (_event, on: boolean) => setFullscreen(on));
window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.invoke("desktop:is-fullscreen").then((on: boolean) => setFullscreen(on));
});

contextBridge.exposeInMainWorld("dubblDesktop", {
  platform,
  version: ipcRenderer.sendSync("desktop:version") as string,
  setTheme: (theme: "light" | "dark" | "system") => ipcRenderer.send("desktop:set-theme", theme),
});

// The bundled connect and offline screens (file://) also get to pick a server.
if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("dubblConnect", {
    current: () => ipcRenderer.invoke("connect:current") as Promise<{ serverUrl?: string; cloudUrl: string }>,
    connect: (url: string) =>
      ipcRenderer.invoke("connect:submit", url) as Promise<{ ok: true } | { ok: false; error: string }>,
    retry: () => ipcRenderer.send("connect:retry"),
    change: () => ipcRenderer.send("connect:change"),
  });
}
