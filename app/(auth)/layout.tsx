"use client";

import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo className="h-6 w-auto" />
          <span className="text-sm font-bold text-foreground tracking-tight">
            dubbl
          </span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-3">
              <Logo className="h-6 w-auto text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">dubbl</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Open source bookkeeping, done right
            </p>
          </div>

          {/* Form card */}
          <div className="bg-card border border-border rounded-md p-6 shadow-sm">
            {children}
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <Link
              href="/"
              className="transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <span className="text-border">&middot;</span>
            <span>Trusted by teams worldwide</span>
          </div>
        </div>
      </main>
    </div>
  );
}
