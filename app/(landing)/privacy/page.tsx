import type { Metadata } from "next";
import { Shield } from "lucide-react";
import {
  LegalPageLayout,
  Callout,
  type LegalSection,
} from "@/components/legal/legal-page-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — dubbl",
  description:
    "How dubbl (Mindroot Ltd) collects, uses, and protects your personal data under the UK GDPR.",
};

const sections: LegalSection[] = [
  {
    id: "data-controller",
    title: "Data Controller",
    content: (
      <>
        <p>
          The data controller for personal data processed through dubbl.dev is:
        </p>
        <p>
          <strong>Mindroot Ltd</strong>
          <br />
          Company No. 16543299, registered in England and Wales
          <br />
          71-75 Shelton Street, London, England, WC2H 9JQ
          <br />
          ICO Registration: ZB958997
        </p>
        <p>
          For data protection enquiries, contact us at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: (
      <>
        <p>We collect the following categories of personal data:</p>
        <ul>
          <li>
            <strong>Account data</strong> — name, email address, and
            authentication credentials when you create an account.
          </li>
          <li>
            <strong>Usage data</strong> — pages visited, features used, session
            duration, device type, browser, and IP address.
          </li>
          <li>
            <strong>Payment data</strong> — processed securely by Stripe. We
            store only the last four digits of your card, billing address, and
            transaction history. We never have access to your full card number.
          </li>
          <li>
            <strong>Communication data</strong> — messages you send us via
            email or in-app support.
          </li>
          <li>
            <strong>Cookies &amp; similar technologies</strong> — see Section 10
            for details.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "purposes-of-processing",
    title: "Purposes of Processing",
    content: (
      <>
        <p>We process your personal data for the following purposes:</p>
        <ul>
          <li>
            <strong>Service delivery</strong> — providing, maintaining, and
            improving the dubbl platform.
          </li>
          <li>
            <strong>Payments</strong> — processing subscriptions and invoices
            via Stripe.
          </li>
          <li>
            <strong>Communication</strong> — responding to support requests,
            sending service updates, and notifying you of material changes.
          </li>
          <li>
            <strong>Improvement</strong> — understanding how the service is used
            to improve features and user experience.
          </li>
          <li>
            <strong>Security</strong> — detecting, preventing, and responding to
            fraud, abuse, and security incidents.
          </li>
          <li>
            <strong>Legal compliance</strong> — meeting our obligations under
            applicable law, including tax and accounting requirements.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "lawful-bases",
    title: "Lawful Bases",
    content: (
      <>
        <p>
          We rely on the following lawful bases under the UK GDPR for processing
          your data:
        </p>
        <ul>
          <li>
            <strong>Contract (Art 6(1)(b))</strong> — processing necessary to
            perform our contract with you, including providing the service and
            managing your account.
          </li>
          <li>
            <strong>Legitimate interests (Art 6(1)(f))</strong> — improving our
            service, ensuring security, and preventing fraud, balanced against
            your rights and freedoms.
          </li>
          <li>
            <strong>Consent (Art 6(1)(a))</strong> — where you opt in to
            optional features such as marketing emails. You may withdraw consent
            at any time.
          </li>
          <li>
            <strong>Legal obligation (Art 6(1)(c))</strong> — where we are
            required to process data by law, such as tax reporting.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-sharing",
    title: "Data Sharing",
    content: (
      <>
        <p>We share personal data only with the following categories of recipients:</p>
        <ul>
          <li>
            <strong>Hosting providers</strong> — infrastructure and cloud
            services that store and process data on our behalf.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing. Stripe acts as an
            independent controller for payment data.
          </li>
          <li>
            <strong>Analytics providers</strong> — to understand usage patterns
            and improve the service.
          </li>
        </ul>
        <p>
          <strong>
            We do not sell your personal data to third parties, and we never
            will.
          </strong>
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International Transfers",
    content: (
      <>
        <p>
          Some of our service providers may process data outside the United
          Kingdom. Where transfers occur, we ensure appropriate safeguards are
          in place, including:
        </p>
        <ul>
          <li>
            Transfers to countries with UK adequacy regulations (including the
            EEA).
          </li>
          <li>
            Standard Contractual Clauses (SCCs) and/or the International Data
            Transfer Agreement (IDTA) approved by the ICO.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: (
      <>
        <p>We retain personal data only as long as necessary:</p>
        <ul>
          <li>
            <strong>Account data</strong> — retained while your account is
            active, plus 30 days after deletion to allow recovery.
          </li>
          <li>
            <strong>Usage data</strong> — retained for up to 26 months, then
            anonymised or deleted.
          </li>
          <li>
            <strong>Payment records</strong> — retained for 7 years to comply
            with UK tax and accounting obligations.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: (
      <>
        <p>
          Under the UK GDPR, you have the following rights regarding your
          personal data:
        </p>
        <Callout icon={Shield} title="Your Data Rights">
          <ul>
            <li>Right of access — obtain a copy of your data</li>
            <li>Right to rectification — correct inaccurate data</li>
            <li>Right to erasure — request deletion of your data</li>
            <li>Right to restrict processing</li>
            <li>Right to data portability — receive data in a portable format</li>
            <li>Right to object — object to processing based on legitimate interests</li>
            <li>Rights related to automated decision-making and profiling</li>
            <li>Right to withdraw consent at any time</li>
          </ul>
        </Callout>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a>. We will respond
          within 30 days. If we need to extend this period, we will notify you
          with reasons.
        </p>
      </>
    ),
  },
  {
    id: "right-to-complain",
    title: "Right to Complain",
    content: (
      <>
        <p>
          If you are unhappy with how we handle your data, you have the right to
          lodge a complaint with the Information Commissioner&apos;s Office (ICO):
        </p>
        <p>
          Information Commissioner&apos;s Office
          <br />
          Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF
          <br />
          Telephone: 0303 123 1113
          <br />
          Website:{" "}
          <a
            href="https://ico.org.uk"
            target="_blank"
            rel="noopener noreferrer"
          >
            ico.org.uk
          </a>
        </p>
        <p>
          We encourage you to contact us first at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a> so we can try to
          resolve your concern directly.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    content: (
      <>
        <p>We use the following types of cookies:</p>
        <ul>
          <li>
            <strong>Strictly necessary cookies</strong> — essential for the
            service to function (e.g. session authentication). These do not
            require consent.
          </li>
          <li>
            <strong>Functional cookies</strong> — remember your preferences such
            as theme and language settings.
          </li>
          <li>
            <strong>Analytics cookies</strong> — help us understand how the
            service is used. Under PECR and the Data Use and Access Act 2025
            analytics exemption, certain first-party analytics cookies may be
            set without prior consent where they are used solely for statistical
            purposes.
          </li>
        </ul>
        <p>
          You can manage cookie preferences through your browser settings. Note
          that disabling certain cookies may affect service functionality.
        </p>
      </>
    ),
  },
  {
    id: "self-hosted-instances",
    title: "Self-Hosted Instances",
    content: (
      <>
        <p>
          This privacy policy applies exclusively to the hosted service at{" "}
          <strong>dubbl.dev</strong>. If you self-host dubbl using our
          open-source code, you are responsible for your own data processing,
          privacy policy, and compliance with applicable data protection laws.
        </p>
      </>
    ),
  },
  {
    id: "childrens-data",
    title: "Children's Data",
    content: (
      <>
        <p>
          dubbl is not directed at individuals under the age of 16. We do not
          knowingly collect personal data from children. If you believe we have
          inadvertently collected data from a child, please contact us at{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a> and we will
          promptly delete it.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <>
        <p>
          We implement appropriate technical and organisational measures to
          protect your personal data, including:
        </p>
        <ul>
          <li>TLS encryption for all data in transit.</li>
          <li>Encryption at rest for stored data.</li>
          <li>
            Access controls ensuring only authorised personnel can access
            personal data.
          </li>
          <li>Regular security reviews and monitoring.</li>
        </ul>
        <p>
          No system is 100% secure. If you discover a security vulnerability,
          please report it to{" "}
          <a href="mailto:team@dubbl.dev">team@dubbl.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: (
      <>
        <p>
          We may update this privacy policy from time to time. For material
          changes, we will notify you by email at least 30 days before the
          changes take effect. Continued use of the service after the effective
          date constitutes acceptance of the updated policy.
        </p>
        <p>
          We encourage you to review this page periodically for the latest
          information on our data practices.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      badge="Legal"
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your personal data at dubbl."
      lastUpdated="2 March 2026"
      sections={sections}
    />
  );
}
