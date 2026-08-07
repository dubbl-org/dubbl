"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center px-6 text-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            PayrollPro
          </span>
        </Link>

        {/* 404 */}
        <h1 className="mt-12 text-[120px] font-bold leading-none tracking-tighter text-foreground/20 sm:text-[160px] md:text-[200px]">
          404
        </h1>

        {/* Message */}
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          This page doesn&apos;t exist or has been moved.
        </p>

        {/* CTA */}
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Status */}
        <p className="mt-12 font-mono text-[11px] text-muted-foreground/40">
          HTTP 404 Not Found
        </p>
      </div>
    </div>
  );
}
