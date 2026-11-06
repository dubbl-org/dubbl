import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export const CLOUD_URL = "https://dubbl.dev";

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

interface Settings {
  /** The dubbl server this app talks to. Unset until the user picks one. */
  serverUrl?: string;
  window?: WindowState;
}

const file = () => path.join(app.getPath("userData"), "settings.json");

let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), "utf8")) as Settings;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Settings) {
  cache = next;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("Couldn't save settings", err);
  }
}

/** `DUBBL_URL` (used by `pnpm dev`) wins over the saved choice. */
export function getServerUrl(): string | undefined {
  return process.env.DUBBL_URL || read().serverUrl;
}

export function setServerUrl(url: string) {
  write({ ...read(), serverUrl: url });
}

export function getWindowState(): WindowState | undefined {
  return read().window;
}

export function setWindowState(state: WindowState) {
  write({ ...read(), window: state });
}

/**
 * Turn what someone typed into a server origin: adds a scheme (http for
 * localhost and LAN addresses, https otherwise) and drops any path.
 */
export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]+\.local)/i;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${local.test(trimmed) ? "http" : "https"}://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.origin;
  } catch {
    return null;
  }
}
