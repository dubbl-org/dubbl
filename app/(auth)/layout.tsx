import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Check } from "lucide-react";

const features = [
  "Double-entry accounting",
  "Self-host anywhere",
  "API-first design",
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - hidden on mobile */}
      <div className="relative hidden overflow-hidden bg-[#0a0a0a] lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        {/* Emerald gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-transparent to-emerald-900/20" />

        {/* Decorative grid lines */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Top - Logo */}
        <div className="relative z-10 p-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="text-white" />
            <span className="text-lg font-bold tracking-tight text-white">
              dubbl
            </span>
          </Link>
        </div>

        {/* Center - Content */}
        <div className="relative z-10 flex flex-1 flex-col items-start justify-center px-12">
          <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white">
            Open source bookkeeping, done right.
          </h1>
          <div className="mt-8 space-y-3">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="size-3.5 text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-white/80">
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom - Trust text */}
        <div className="relative z-10 p-8">
          <p className="text-xs text-white/40">Trusted by teams worldwide</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-4 lg:w-1/2">
        {/* Mobile logo */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="text-emerald-600" />
            <span className="text-lg font-bold tracking-tight">dubbl</span>
          </Link>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
