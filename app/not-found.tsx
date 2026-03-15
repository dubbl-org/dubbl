"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Noise grain overlay */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0" />

      {/* Container-edge vertical lines */}
      <div className="pointer-events-none fixed inset-0 z-[60] flex justify-center">
        <div className="w-full max-w-[1400px]">
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 w-px bg-foreground/10" />
            <div className="absolute inset-y-0 right-0 w-px bg-foreground/10" />
          </div>
        </div>
      </div>

      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98112_1px,transparent_1px),linear-gradient(to_bottom,#10b98112_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(to_right,#10b98106_1px,transparent_1px),linear-gradient(to_bottom,#10b98106_1px,transparent_1px)]" />

        {/* Radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(16,185,129,0.15),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(16,185,129,0.08),transparent_70%)]" />

        {/* Pulsing center glow */}
        <motion.div
          className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.06] blur-[100px] dark:bg-emerald-500/[0.03]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Orbital rings */}
        <motion.svg
          viewBox="0 0 800 800"
          fill="none"
          className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 lg:h-[900px] lg:w-[900px]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.5, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 2, ease: "easeOut" },
            scale: { duration: 2, ease: "easeOut" },
            rotate: { duration: 90, ease: "linear", repeat: Infinity },
          }}
        >
          <ellipse cx="400" cy="400" rx="380" ry="380" stroke="url(#r1)" strokeWidth="0.8" />
          <ellipse cx="400" cy="400" rx="280" ry="280" stroke="url(#r2)" strokeWidth="0.6" />
          <ellipse cx="400" cy="400" rx="180" ry="180" stroke="url(#r1)" strokeWidth="0.5" />
          <circle cx="400" cy="20" r="3" fill="#10b981" opacity="0.4" />
          <circle cx="680" cy="400" r="2.5" fill="#10b981" opacity="0.3" />
          <defs>
            <linearGradient id="r1" x1="0" y1="0" x2="800" y2="800">
              <stop stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="0.5" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="1" stopColor="#10b981" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="r2" x1="800" y1="0" x2="0" y2="800">
              <stop stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="0.5" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="1" stopColor="#10b981" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Dashed blueprint rects */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.3 }}
          className="absolute -left-12 top-[15%] size-48 rounded-2xl border border-dashed border-emerald-500/15"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="absolute -right-8 bottom-[20%] h-36 w-52 rounded-2xl border border-dashed border-emerald-500/15"
        />

        {/* Edge fades */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              dubbl
            </span>
          </Link>
        </motion.div>

        {/* 404 number */}
        <motion.div
          className="relative mt-12"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <h1 className="font-[family-name:var(--font-display)] text-[120px] font-bold leading-none tracking-tighter sm:text-[160px] md:text-[200px]">
            <span className="bg-gradient-to-b from-foreground via-foreground/80 to-foreground/20 bg-clip-text text-transparent">
              4
            </span>
            <span className="relative bg-gradient-to-b from-emerald-600 via-emerald-500 to-emerald-400/40 bg-clip-text text-transparent dark:from-emerald-400 dark:via-emerald-300 dark:to-emerald-300/30">
              0
              {/* Glowing dot inside the zero */}
              <motion.div
                className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/60 blur-sm"
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
            <span className="bg-gradient-to-b from-foreground via-foreground/80 to-foreground/20 bg-clip-text text-transparent">
              4
            </span>
          </h1>
        </motion.div>

        {/* Message */}
        <motion.p
          className="mt-8 max-w-md text-lg text-muted-foreground sm:text-xl"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          This page doesn&apos;t exist or has been moved.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10"
        >
          <Link
            href="/"
            className={cn(
              "group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-600 px-8",
              "text-sm font-semibold text-white shadow-lg shadow-emerald-600/25",
              "transition-all duration-200 hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-600/30",
              "active:scale-[0.98]"
            )}
          >
            {/* Shimmer */}
            <motion.div
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
              animate={{ translateX: ["calc(-100%)", "calc(200%)"] }}
              transition={{
                duration: 2.5,
                delay: 1.5,
                repeat: Infinity,
                repeatDelay: 4,
                ease: "easeInOut",
              }}
            />
            <ArrowLeft className="relative size-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="relative">Back to Home</span>
          </Link>
        </motion.div>

        {/* Subtle bottom text */}
        <motion.p
          className="mt-16 font-mono text-[11px] text-muted-foreground/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <span className="text-emerald-600/40 dark:text-emerald-400/40">HTTP</span>{" "}
          404 Not Found
        </motion.p>
      </div>
    </div>
  );
}
