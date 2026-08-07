"use client";

import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="relative z-20">
        <div className="flex items-center justify-center py-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="text-sm font-bold tracking-tight text-foreground">
              PayrollPro
            </span>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12">
        {children}
      </main>

      {/* Theme toggle */}
      <div className="fixed bottom-4 right-4 z-20">
        <ThemeToggle />
      </div>
    </div>
  );
}
