import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { Logo } from "@/components/shared/logo";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-7" />
            <span className="font-semibold tracking-tight">dubbl</span>
          </div>
        ),
        url: "/",
      }}
      links={[
        { text: "App", url: "/dashboard" },
        {
          text: "GitHub",
          url: "https://github.com/dubbl-org/dubbl",
          external: true,
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
