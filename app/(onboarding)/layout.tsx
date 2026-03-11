"use client";

import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { OrbitalDecoration } from "@/components/shared/orbital-decoration";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Noise grain */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0" />

      {/* Dot pattern */}
      <div className="dot-pattern pointer-events-none fixed inset-0 z-0" />

      {/* Subtle emerald glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] translate-x-1/4 translate-y-1/4 rounded-full bg-teal-500/[0.05] blur-[100px]" />
      </div>

      {/* Orbital decorations */}
      <OrbitalDecoration className="fixed -right-[10%] -top-[15%] z-0 h-[800px] w-[800px] lg:h-[900px] lg:w-[900px]" />
      <OrbitalDecoration className="fixed -bottom-[20%] -left-[12%] z-0 h-[600px] w-[600px] rotate-180 lg:h-[700px] lg:w-[700px]" />

      {/* Container edge lines */}
      <div className="pointer-events-none fixed inset-0 z-[5] flex justify-center">
        <div className="w-full max-w-lg px-4">
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 w-px bg-foreground/[0.06]" />
            <div className="absolute inset-y-0 right-0 w-px bg-foreground/[0.06]" />
          </div>
        </div>
      </div>

      <header className="relative z-20">
        <div className="flex items-center justify-center py-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold tracking-tight text-foreground">
              dubbl
            </span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12">
        {children}
      </main>

      <div className="fixed bottom-4 right-4 z-20">
        <ThemeToggle />
      </div>
    </div>
  );
}
