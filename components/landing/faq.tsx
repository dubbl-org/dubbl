import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import Link from "next/link";

const faqs = [
  {
    question: "Is dubbl really free?",
    answer:
      "Yes. dubbl is open source under the Apache 2.0 license. You can self-host it for free with no feature limitations, no user caps, and no hidden costs.",
  },
  {
    question: "Can I self-host dubbl?",
    answer:
      "Absolutely. dubbl is designed for self-hosting. We provide Docker images, Helm charts, and comprehensive deployment guides for AWS, GCP, and bare metal.",
  },
  {
    question: "Does dubbl support multi-currency?",
    answer:
      "Yes. dubbl supports transactions in any currency with automatic exchange rate conversion. Realized and unrealized gain/loss tracking is built in.",
  },
  {
    question: "How does double-entry bookkeeping work in dubbl?",
    answer:
      "Every transaction must have balanced debits and credits. This is enforced at the database level, meaning it's impossible to create an unbalanced entry. dubbl supports multi-leg journal entries for complex transactions.",
  },
  {
    question: "Can I migrate from QuickBooks or Xero?",
    answer:
      "Yes. dubbl includes import tools for QuickBooks, Xero, FreshBooks, and CSV/Excel files. Most migrations can be completed in under an hour.",
  },
  {
    question: "Is there an API?",
    answer:
      "dubbl is API-first. Every feature available in the UI is also accessible via our REST API. We provide SDKs for Python, Node.js, and Go, plus comprehensive OpenAPI documentation.",
  },
  {
    question: "How do I contribute to dubbl?",
    answer:
      "We welcome contributions! Check out our GitHub repository for contributing guidelines, open issues labeled 'good first issue', and our development setup guide.",
  },
  {
    question: "Is dubbl suitable for enterprise use?",
    answer:
      "Yes. dubbl includes features like audit trails, role-based access control, SSO/SAML support, and multi-tenant architecture. Many companies use dubbl in production for their core accounting needs.",
  },
];

export function FAQ() {
  return (
    <section className="py-16 md:py-20">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          {/* Left column */}
          <div>
            <SectionHeader
              badge="FAQs"
              title="Frequently asked questions"
              align="left"
              className="mb-6"
            />
            <p className="text-sm text-muted-foreground">
              Can&apos;t find what you&apos;re looking for?{" "}
              <Link
                href="/contact"
                className="text-emerald-600 underline underline-offset-4 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                Contact us
              </Link>
              .
            </p>
          </div>

          {/* Right column */}
          <div>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border-b border-border"
                >
                  <AccordionTrigger className="py-5 text-left text-base font-medium text-foreground hover:no-underline md:text-lg">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </Container>
    </section>
  );
}
