import { Github, Twitter, MessageCircle } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Container } from "@/components/shared/container";
import { Separator } from "@/components/ui/separator";

const footerLinks = {
  Product: ["Features", "Pricing", "Self-Hosting", "Changelog", "Roadmap"],
  Developers: ["Documentation", "API Reference", "SDKs", "Webhooks", "Status"],
  Community: [
    "GitHub",
    "Discord",
    "Contributing",
    "Code of Conduct",
    "Blog",
  ],
};

const socialLinks = [
  { icon: Github, href: "https://github.com", label: "GitHub" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: MessageCircle, href: "#", label: "Discord" },
];

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 pt-16 pb-8">
      <Container>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <Logo className="text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">dubbl</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Open source bookkeeping for modern teams. Double-entry accounting
              that developers love.
            </p>
            <div className="mt-4 flex items-center gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={link.label}
                >
                  <link.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="mb-3 text-sm font-semibold">{title}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; 2026 dubbl. Apache 2.0 License.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="transition-colors hover:text-foreground">
              Privacy Policy
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Terms of Service
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
