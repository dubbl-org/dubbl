"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";

const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "Developers", href: "/#developers" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12">
        <nav className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-2" aria-label="dubbl home">
              <Logo className="h-6 w-[30px]" />
              <span className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">dubbl</span>
            </Link>

            <div className="hidden items-center gap-7 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <a
              href="https://github.com/dubbl-org/dubbl"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <Link
              href="/sign-in"
              className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Start free
            </Link>
          </div>

          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-2 border-b border-border px-6 py-5">
                    <Logo className="h-6 w-[30px]" />
                    <SheetTitle className="text-[15px] font-semibold tracking-[-0.03em]">dubbl</SheetTitle>
                  </div>
                  <nav className="flex flex-col px-3 pt-3">
                    {navLinks.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-md px-3 py-2.5 text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="mt-auto flex flex-col gap-2 border-t border-border p-6">
                    <Link
                      href="/sign-in"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-border text-sm"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/sign-up"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
                    >
                      Start free
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>
    </header>
  );
}
