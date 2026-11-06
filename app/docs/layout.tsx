import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { source } from "@/lib/source";
import { docsOptions } from "@/components/docs/layout-options";
import { SectionSwitcher } from "@/components/docs/section-switcher";
import { SidebarScrollKeeper } from "@/components/docs/sidebar-scroll-keeper";
import "./fumadocs.css";
import "./docs.css";

export default function Layout({ children }: { children: ReactNode }) {
  const options = docsOptions();
  // Only the docs get Fumadocs' provider: its search dialog binds ⌘K, which the app's
  // own command palette owns everywhere else. The app's ThemeProvider already wraps this.
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={source.getPageTree()}
        {...options}
        nav={{ ...options.nav, mode: "top", children: <SectionSwitcher /> }}
        sidebar={{ tabs: false }}
      >
        <SidebarScrollKeeper />
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
