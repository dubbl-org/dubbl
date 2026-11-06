import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/shared/logo";

/** The docs header: the dubbl mark and "Docs", a link home and a way into the app. */
export function docsOptions(): BaseLayoutProps {
  return {
    nav: {
      url: "/docs/guides",
      title: (
        <span className="flex items-center gap-2">
          <Logo className="h-[17px] w-auto" />
          <span className="text-[15px] font-semibold tracking-tight">dubbl</span>
          <span className="text-[15px] font-normal text-muted-foreground">Docs</span>
        </span>
      ),
    },
    githubUrl: "https://github.com/dubbl-org/dubbl",
    themeSwitch: { mode: "light-dark" },
    links: [
      { text: "dubbl.dev", url: "/" },
      {
        type: "custom",
        on: "nav",
        secondary: true,
        children: (
          <a
            href="/dashboard"
            className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition-opacity hover:opacity-85"
          >
            Open dubbl
          </a>
        ),
      },
    ],
  };
}
