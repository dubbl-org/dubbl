import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import "fumadocs-ui/style.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://dubbl.dev";

export const metadata: Metadata = {
  title: {
    default: "dubbl · Open-Source Accounting, ERP & Business Management",
    template: "%s · dubbl",
  },
  description:
    "Free, open-source double-entry accounting with invoicing, bills, payroll, inventory, projects, and CRM. Self-host or use our cloud. API-first, MCP-ready, Apache 2.0.",
  metadataBase: new URL(APP_URL),
  keywords: [
    "open source accounting",
    "double-entry bookkeeping",
    "invoicing software",
    "accounts payable",
    "accounts receivable",
    "general ledger",
    "ERP",
    "payroll software",
    "inventory management",
    "project management",
    "CRM",
    "self-hosted accounting",
    "API-first accounting",
    "small business accounting",
    "free accounting software",
  ],
  authors: [{ name: "dubbl", url: APP_URL }],
  creator: "dubbl",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "dubbl",
    title: "dubbl · Open-Source Accounting & Business Management",
    description:
      "Free, open-source double-entry accounting with invoicing, bills, payroll, inventory, projects, and CRM. Self-host or use our cloud.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "dubbl - Open-source accounting for modern teams",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "dubbl · Open-Source Accounting & Business Management",
    description:
      "Free, open-source double-entry accounting with invoicing, bills, payroll, inventory, projects, and CRM. Self-host or use our cloud.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo.svg",
    apple: "/web-app-manifest-192x192.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="Dubbl" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <RootProvider>
            <SessionProvider>{children}</SessionProvider>
          </RootProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
