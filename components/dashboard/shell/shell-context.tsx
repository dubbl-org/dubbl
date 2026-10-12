"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import type { SubnavSection } from "./nav";

interface ShellState {
  subnav: SubnavSection[] | null;
  setSubnav: (sections: SubnavSection[] | null) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const ShellCtx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [subnav, setSubnav] = useState<SubnavSection[] | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ShellCtx.Provider value={{ subnav, setSubnav, mobileOpen, setMobileOpen }}>
      {children}
    </ShellCtx.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}

/**
 * Show a section's sub-pages in the shell panel. Layouts call this with the
 * same list they render as tabs on smaller screens.
 */
export function useShellSubnav(sections: SubnavSection[]) {
  const setSubnav = useContext(ShellCtx)?.setSubnav;
  const key = JSON.stringify(sections);

  useLayoutEffect(() => {
    if (!setSubnav) return;
    setSubnav(JSON.parse(key));
    return () => setSubnav(null);
  }, [key, setSubnav]);
}
