import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
}

export function EmailLayout({ preview, children, unsubscribeUrl }: LayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>dubbl</Text>
          </Section>
          {children}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              Sent by dubbl
              {unsubscribeUrl && (
                <>
                  {" · "}
                  <Link href={unsubscribeUrl} style={footerLink}>
                    Unsubscribe
                  </Link>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden",
  marginTop: "40px",
  marginBottom: "40px",
};

const logoSection: React.CSSProperties = {
  padding: "24px 32px 0",
};

const logo: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#111",
  margin: 0,
};

const hr: React.CSSProperties = {
  borderColor: "#e6ebf1",
  margin: "0 32px",
};

const footer: React.CSSProperties = {
  padding: "16px 32px 24px",
};

const footerText: React.CSSProperties = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  margin: 0,
};

const footerLink: React.CSSProperties = {
  color: "#8898aa",
  textDecoration: "underline",
};
