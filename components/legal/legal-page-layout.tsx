import { Calendar, type LucideIcon } from "lucide-react";
import { Container } from "@/components/shared/container";
import { LegalToc } from "@/components/legal/legal-toc";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalPageLayoutProps {
  badge: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export function LegalPageLayout({
  badge,
  title,
  subtitle,
  lastUpdated,
  sections,
}: LegalPageLayoutProps) {
  const tocItems = sections.map((s) => ({ id: s.id, title: s.title }));

  return (
    <>
      {/* Hero header */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-emerald-50/50 via-background to-background pt-28 pb-12 dark:from-emerald-950/20">
        {/* Gradient mesh */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.08),transparent)]" />
        <Container className="relative">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
            {badge}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            {subtitle}
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>Last updated: {lastUpdated}</span>
          </div>
        </Container>
      </section>

      {/* Two-column content */}
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <LegalToc items={tocItems} />

          <div>
            {sections.map((section, i) => (
              <div
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-b border-border pb-8 mb-8 last:border-0 last:pb-0 last:mb-0"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    {i + 1}
                  </span>
                  <h2 className="text-xl font-semibold text-foreground">
                    {section.title}
                  </h2>
                </div>
                <div className="text-[15px] leading-relaxed text-muted-foreground [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:text-emerald-600 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-emerald-400">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}

export function Callout({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-4 rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-4 dark:border-emerald-800/30 dark:bg-emerald-950/20">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {title}
        </span>
      </div>
      <div className="text-[14px] leading-relaxed text-muted-foreground [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 last:[&_p]:mb-0 last:[&_ul]:mb-0">
        {children}
      </div>
    </div>
  );
}
