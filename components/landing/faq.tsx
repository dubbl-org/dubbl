import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Eyebrow, Heading, Section } from "@/components/landing/ledger";

const faqs = [
  {
    question: "Is dubbl really free?",
    answer:
      "Yes. dubbl is open source under the Apache 2.0 license, and self-hosting is free with no user caps and no locked features. Our hosted cloud has a free plan too — see pricing for what the paid plans add.",
  },
  {
    question: "Can I self-host dubbl?",
    answer:
      "Yes. dubbl runs on Node.js and PostgreSQL, and the self-hosting guide walks through a production setup with Docker Compose. Your data never has to leave your own servers.",
  },
  {
    question: "Does dubbl support multi-currency?",
    answer:
      "Yes. Record transactions in any ISO 4217 currency with exchange rates applied automatically, and track realized and unrealized gains and losses.",
  },
  {
    question: "How does double-entry work in dubbl?",
    answer:
      "Every journal entry must have equal debits and credits — unbalanced entries are rejected, whether they come from the app, the API or an AI agent. Entries can have as many lines as you need, and posted entries are voided rather than edited, so your history stays intact.",
  },
  {
    question: "Can I migrate from QuickBooks or Xero?",
    answer:
      "Yes. CSV import has built-in column mapping for QuickBooks, Xero, FreshBooks and Wave. You can bring in accounts, contacts, invoices, bills, journal entries, products and bank transactions.",
  },
  {
    question: "Is there an API?",
    answer:
      "Yes. Everything in the app is available over a documented REST API, authenticated with API keys you create in settings. There is also an MCP server for AI agents.",
  },
  {
    question: "What is MCP support?",
    answer:
      "MCP (Model Context Protocol) is an open standard that lets AI assistants use external tools. dubbl's MCP server exposes 357 tools across 55 modules, so Claude, Cursor or any MCP client can read and update your books after you sign in and approve access.",
  },
  {
    question: "Does it work for a team?",
    answer:
      "Yes. Invite your team with owner, admin or member roles, route bills and invoices through approvals, lock closed periods, and see who changed what in the audit log.",
  },
  {
    question: "How do I contribute?",
    answer:
      "Everything happens on GitHub — open issues, discussions and pull requests are welcome. The contributing guide covers the local development setup.",
  },
];

export function FAQ() {
  return (
    <Section className="py-20 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Eyebrow index="04">FAQ</Eyebrow>
          <Heading lead="Questions." className="mt-5 max-w-[12ch]">
            Answered.
          </Heading>
          <p className="mt-6 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
            Something missing? Ask on{" "}
            <a
              href="https://github.com/dubbl-org/dubbl/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              GitHub Discussions
            </a>
            .
          </p>
        </div>

        <Accordion type="single" collapsible className="border-t border-border">
          {faqs.map((faq, i) => (
            <AccordionItem key={faq.question} value={`faq-${i}`} className="border-border last:border-b">
              <AccordionTrigger className="gap-6 py-5 text-[15px] font-medium tracking-[-0.01em] text-foreground hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="max-w-[60ch] pb-6 text-[15px] leading-relaxed text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
