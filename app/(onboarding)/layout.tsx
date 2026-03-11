import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0" />
      <div className="pointer-events-none fixed inset-0 z-0 gradient-mesh" />

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
    </div>
  );
}
