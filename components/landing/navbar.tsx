"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";
import { Container } from "@/components/shared/container";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/50 bg-background/80 backdrop-blur-xl shadow-[0_1px_3px_0_rgb(0_0_0/0.02)]"
          : "bg-transparent"
      )}
    >
      <Container>
        <nav className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              dubbl
            </span>
          </Link>

          {/* Desktop navigation - center */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="relative px-4 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop right actions */}
          <div className="hidden items-center gap-3 md:flex">
            <ThemeToggle />
            <div className="h-4 w-px bg-border" />
            <Link
              href="/sign-in"
              className="px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Sign in
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-emerald-600 px-5 text-white hover:bg-emerald-500 transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]"
            >
              <Link href="/sign-up" className="flex items-center gap-1.5">
                Get Started
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  {/* Sheet header */}
                  <div className="flex items-center gap-2.5 px-6 pt-6 pb-4">
                    <Logo />
                    <SheetTitle className="text-[15px] font-semibold tracking-tight">
                      dubbl
                    </SheetTitle>
                  </div>

                  {/* Divider */}
                  <div className="mx-6 h-px bg-border" />

                  {/* Navigation links */}
                  <nav className="flex flex-col gap-1 px-4 pt-4">
                    {navLinks.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>

                  {/* Mobile actions */}
                  <div className="mt-auto flex flex-col gap-3 px-6 pb-8">
                    <div className="mb-2 h-px bg-border" />
                    <Button
                      asChild
                      variant="ghost"
                      className="w-full justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Link
                        href="/sign-in"
                        onClick={() => setMobileOpen(false)}
                      >
                        Sign in
                      </Link>
                    </Button>
                    <Button
                      asChild
                      className="w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-all duration-200"
                    >
                      <Link
                        href="/sign-up"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-center gap-1.5"
                      >
                        Get Started
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </Container>
    </motion.header>
  );
}
