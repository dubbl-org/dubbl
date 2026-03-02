import type { Metadata } from "next";
import { Scale, Clock, BookOpen } from "lucide-react";
import {
  LegalPageLayout,
  Callout,
  type LegalSection,
} from "@/components/legal/legal-page-layout";

export const metadata: Metadata = {
  title: "Terms of Service — dubbl",
  description:
    "Terms governing your use of the dubbl hosted service, operated by Mindroot Ltd.",
};

const sections: LegalSection[] = [
  {
    id: "company-details",
    title: "Company Details",
    content: (
      <>
        <p>
          The dubbl hosted service at dubbl.dev is operated by:
        </p>
        <p>
          <strong>Mindroot Ltd</strong>
          <br />
          Company No. 16543299, registered in England and Wales
          <br />
          Registered office: 71-75 Shelton Street, London, England, WC2H 9JQ
          <br />
          Contact: <a href="mailto:team@dubbl.dev">team@dubbl.dev</a>
        </p>
        <p>
          This information is provided in compliance with the Electronic Commerce
          (EC Directive) Regulations 2002.
        </p>
      </>
    ),
  },
  {
    id: "service-description",
    title: "Service Description",
    content: (
      <>
        <p>
          dubbl is a double-entry bookkeeping platform available as both a hosted
          SaaS at dubbl.dev and an open-source project that can be self-hosted.
          These Terms govern your use of the <strong>hosted service</strong>{" "}
          only.
        </p>
        <p>
          The service allows you to record financial transactions, manage
          accounts, generate reports, and integrate with third-party tools via
          our API.
        </p>
      </>
    ),
  },
  {
    id: "account-terms",
    title: "Account Terms",
    content: (
      <>
        <p>To use the service, you must:</p>
        <ul>
          <li>Be at least 16 years of age.</li>
          <li>Provide accurate and complete registration information.</li>
          <li>
            Keep your account credentials secure. You are responsible for all
            activity under your account.
          </li>
        </ul>
        <p>
          You must notify us immediately at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a> if you suspect
          unauthorised access to your account.
        </p>
      </>
    ),
  },
  {
    id: "subscription-payment",
    title: "Subscription & Payment",
    content: (
      <>
        <p>
          dubbl offers a free tier and paid subscription plans. Details of
          current plans and pricing are available on our website.
        </p>
        <ul>
          <li>
            Paid subscriptions are billed in advance on a monthly or annual
            basis, depending on your chosen plan.
          </li>
          <li>
            Payments are processed securely by <strong>Stripe</strong>. By
            subscribing, you also agree to{" "}
            <a
              href="https://stripe.com/legal"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe&apos;s terms of service
            </a>
            .
          </li>
          <li>
            We will give at least <strong>30 days&apos; notice</strong> before any
            price increases take effect on your account.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "open-source-vs-hosted",
    title: "Open Source vs Hosted Service",
    content: (
      <>
        <Callout icon={BookOpen} title="Open Source Distinction">
          <p>
            The dubbl source code is licensed under the{" "}
            <strong>Apache License 2.0</strong>. You are free to self-host,
            modify, and distribute the code under that licence.
          </p>
          <p>
            These Terms of Service apply <strong>only</strong> to the hosted
            service at dubbl.dev. Self-hosted instances are governed solely by
            the Apache 2.0 licence.
          </p>
        </Callout>
      </>
    ),
  },
  {
    id: "cancellation-cooling-off",
    title: "Cancellation & Cooling-Off",
    content: (
      <>
        <Callout icon={Clock} title="14-Day Cooling-Off Period">
          <p>
            Under the Consumer Contracts (Information, Cancellation and
            Additional Charges) Regulations 2013, UK consumers have the right
            to cancel within <strong>14 days</strong> of subscribing to a paid
            plan, without giving any reason.
          </p>
        </Callout>
        <p>If you cancel during the cooling-off period:</p>
        <ul>
          <li>
            You may be charged proportionally for the service used up to the
            point of cancellation, if you requested the service begin during the
            cooling-off period.
          </li>
          <li>
            Any refund due will be processed within 14 days of your
            cancellation.
          </li>
        </ul>
        <p>
          After the cooling-off period, you may cancel at any time. Cancellation
          takes effect at the end of the current billing period. No partial
          refunds are provided for unused time.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: (
      <>
        <p>You agree not to use the service to:</p>
        <ul>
          <li>
            Engage in any unlawful activity or process data in violation of
            applicable laws.
          </li>
          <li>
            Attempt to gain unauthorised access to the service, other
            accounts, or connected systems.
          </li>
          <li>
            Deliberately overload, disrupt, or interfere with the service
            infrastructure.
          </li>
          <li>
            Transmit malware, viruses, or other harmful code.
          </li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts that violate
          these terms.
        </p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: (
      <>
        <ul>
          <li>
            The dubbl <strong>source code</strong> is licensed under the Apache
            License 2.0.
          </li>
          <li>
            The dubbl <strong>brand</strong>, logos, service design, and hosted
            infrastructure are owned by Mindroot Ltd and are not covered by the
            open-source licence.
          </li>
          <li>
            <strong>Your data</strong> — you retain full ownership of all
            bookkeeping data you enter into the service. We claim no
            intellectual property rights over your content.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-protection",
    title: "Data Protection",
    content: (
      <>
        <p>
          Our processing of your personal data is governed by our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          For bookkeeping data you enter into the service, dubbl acts as a{" "}
          <strong>data processor</strong> on your behalf. You remain the data
          controller for that data. If you require a formal Data Processing
          Agreement (DPA), please contact us at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, Mindroot Ltd&apos;s total
          aggregate liability arising from or related to your use of the service
          is limited to the <strong>fees you paid in the 12 months</strong>{" "}
          preceding the claim.
        </p>
        <Callout icon={Scale} title="Your Statutory Rights Are Not Affected">
          <p>Nothing in these Terms excludes or limits liability for:</p>
          <ul>
            <li>Death or personal injury caused by negligence.</li>
            <li>Fraud or fraudulent misrepresentation.</li>
            <li>
              Any liability that cannot be excluded under the Consumer Rights
              Act 2015 or other mandatory consumer protection law.
            </li>
          </ul>
        </Callout>
        <p>
          We are not liable for indirect, incidental, special, consequential,
          or punitive damages, including loss of profits, data, or business
          opportunity.
        </p>
      </>
    ),
  },
  {
    id: "digital-content-quality",
    title: "Digital Content Quality",
    content: (
      <>
        <p>
          Under Chapter 3 of the <strong>Consumer Rights Act 2015</strong>,
          digital content supplied through the service must be:
        </p>
        <ul>
          <li>Of satisfactory quality.</li>
          <li>Fit for a particular purpose.</li>
          <li>As described.</li>
        </ul>
        <p>
          If the digital content is faulty or does not meet these standards, you
          may be entitled to a repair, replacement, or price reduction. Contact
          us at <a href="mailto:team@dubbl.dev">team@dubbl.dev</a> to report
          any issues.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    content: (
      <>
        <ul>
          <li>
            <strong>By you</strong> — you may close your account at any time
            from your account settings.
          </li>
          <li>
            <strong>By us, for breach</strong> — we may suspend or terminate
            your account immediately if you materially breach these Terms.
          </li>
          <li>
            <strong>By us, without cause</strong> — we may terminate your
            account with at least <strong>30 days&apos; written notice</strong>.
          </li>
        </ul>
        <p>
          Upon termination, you will have a <strong>30-day window</strong> to
          export your data. After this period, we will delete your data in
          accordance with our Privacy Policy.
        </p>
      </>
    ),
  },
  {
    id: "dispute-resolution",
    title: "Dispute Resolution",
    content: (
      <>
        <p>
          If a dispute arises, we encourage you to contact us first at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a> so we can attempt
          to resolve the matter informally.
        </p>
        <p>
          If informal resolution is unsuccessful, either party may propose
          mediation before pursuing court proceedings. If the dispute cannot be
          resolved through mediation, it may be brought before the courts as
          set out in Section 14.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing Law",
    content: (
      <>
        <p>
          These Terms are governed by the laws of <strong>England and Wales</strong>.
          Any disputes shall be subject to the exclusive jurisdiction of the
          courts of England and Wales.
        </p>
        <p>
          If you are a consumer resident in the UK or EU, nothing in these Terms
          affects your rights under the mandatory consumer protection laws of
          your country of residence.
        </p>
      </>
    ),
  },
  {
    id: "changes-to-terms",
    title: "Changes to Terms",
    content: (
      <>
        <p>
          We may update these Terms from time to time. For material changes, we
          will notify you by email at least <strong>30 days</strong> before the
          changes take effect.
        </p>
        <p>
          Continued use of the service after the effective date constitutes
          acceptance of the updated Terms. If you do not agree with the changes,
          you may close your account before they take effect.
        </p>
      </>
    ),
  },
  {
    id: "severability",
    title: "Severability & General",
    content: (
      <>
        <ul>
          <li>
            <strong>Severability</strong> — if any provision of these Terms is
            found to be unenforceable, the remaining provisions continue in full
            force and effect.
          </li>
          <li>
            <strong>No waiver</strong> — failure to enforce any provision does
            not constitute a waiver of that provision.
          </li>
          <li>
            <strong>Entire agreement</strong> — these Terms, together with our
            Privacy Policy, constitute the entire agreement between you and
            Mindroot Ltd regarding the hosted service.
          </li>
          <li>
            <strong>No assignment</strong> — you may not assign or transfer
            your rights under these Terms without our prior written consent.
            We may assign our rights and obligations in connection with a
            merger, acquisition, or sale of assets.
          </li>
        </ul>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      badge="Legal"
      title="Terms of Service"
      subtitle="The terms governing your use of the dubbl hosted service."
      lastUpdated="2 March 2026"
      sections={sections}
    />
  );
}
