"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/** What the desktop app's preload exposes. Absent in a normal browser. */
interface DubblDesktop {
  platform: "mac" | "windows" | "linux";
  version: string;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

declare global {
  interface Window {
    dubblDesktop?: DubblDesktop;
  }
}

/**
 * Keeps the desktop window's native material (vibrancy / Mica) in the same
 * light or dark mode as the page. Renders nothing in a browser.
 */
export function DesktopBridge() {
  const { theme } = useTheme();

  useEffect(() => {
    const desktop = window.dubblDesktop;
    if (!desktop || !theme) return;
    desktop.setTheme(theme === "dark" || theme === "light" ? theme : "system");
  }, [theme]);

  return null;
}
