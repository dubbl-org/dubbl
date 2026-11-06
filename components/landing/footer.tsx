import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Section } from "@/components/landing/ledger";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

const footerLinks: Record<string, FooterLink[]> = {
  Product: [
    { label: "Pricing", href: "/pricing" },
    { label: "Modules", href: "/#product" },
    { label: "Developers", href: "/#developers" },
    { label: "Self-hosting", href: "/docs/self-hosting" },
    { label: "Changelog", href: "https://github.com/dubbl-org/dubbl/releases", external: true },
  ],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Getting started", href: "/docs/guides/setup" },
    { label: "Migration guide", href: "/docs/guides/import-data" },
    { label: "Tax rates", href: "/docs/guides/tax-rates" },
    { label: "API reference", href: "/docs/developers/api-reference" },
  ],
  Guides: [
    { label: "Multi-currency", href: "/docs/guides/multi-currency" },
    { label: "Integrations", href: "/docs/guides/integrations" },
    { label: "Sales tax and VAT", href: "/docs/learn/sales-tax-and-vat" },
    { label: "Backups & recovery", href: "/docs/guides/backups" },
    { label: "MCP for AI agents", href: "/docs/developers/mcp" },
  ],
  Developers: [
    { label: "GitHub", href: "https://github.com/dubbl-org/dubbl", external: true },
    { label: "Contributing", href: "/docs/developers/contributing" },
    { label: "Developer guide", href: "/docs/developers" },
    { label: "API keys", href: "/docs/developers/authentication" },
    { label: "Status", href: "https://status.dubbl.dev", external: true },
  ],
  Company: [
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms of service", href: "/terms" },
    { label: "Audit log", href: "/docs/guides/audit-log" },
    { label: "Security", href: "/docs/self-hosting" },
    { label: "X / Twitter", href: "https://x.com/DubblHQ", external: true },
  ],
};

const linkClass = "text-[13px] text-muted-foreground transition-colors hover:text-foreground";

export function Footer() {
  return (
    <footer>
      <Section className="pb-10 pt-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6 md:gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2" aria-label="dubbl home">
              <Logo className="h-6 w-[30px]" />
              <span className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">dubbl</span>
            </Link>
            <p className="mt-4 max-w-[24ch] text-[13px] leading-relaxed text-muted-foreground">
              Open-source accounting and business management.
            </p>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">{title}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[12px] text-muted-foreground">&copy; 2026 dubbl. Apache 2.0 License.</p>
            <p className="text-[11px] text-muted-foreground/70">
              Mindroot Ltd &middot; Registered in England and Wales &middot; Company No. 16543299 &middot; 71-75
              Shelton Street, London, WC2H 9JQ
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Section>
    </footer>
  );
}
