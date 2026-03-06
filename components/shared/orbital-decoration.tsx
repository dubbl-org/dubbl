"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function OrbitalDecoration({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.6, ease: "easeOut" }}
      className={cn("pointer-events-none", className)}
    >
      <svg
        viewBox="0 0 720 720"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <motion.ellipse
          cx="360" cy="360" rx="340" ry="340"
          stroke="url(#ring-g-1)" strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, delay: 0.2, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360" cy="360" rx="280" ry="280"
          stroke="url(#ring-g-2)" strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: 0.4, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360" cy="360" rx="210" ry="210"
          stroke="url(#ring-g-3)" strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, delay: 0.6, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360" cy="360" rx="140" ry="140"
          stroke="url(#ring-g-2)" strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.8, ease: "easeOut" }}
        />

        {/* Arc segments */}
        <motion.path
          d="M 360 60 A 300 300 0 0 1 620 260"
          stroke="url(#arc-g-1)" strokeWidth="1" strokeLinecap="round" fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.5, ease: "easeOut" }}
        />
        <motion.path
          d="M 100 460 A 300 300 0 0 1 260 120"
          stroke="url(#arc-g-2)" strokeWidth="1" strokeLinecap="round" fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.7, ease: "easeOut" }}
        />
        <motion.path
          d="M 500 640 A 260 260 0 0 1 660 420"
          stroke="url(#arc-g-1)" strokeWidth="0.75" strokeLinecap="round" fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.9, ease: "easeOut" }}
        />

        {/* Dot accents */}
        <motion.circle
          cx="360" cy="60" r="2.5" fill="#10b981"
          initial={{ opacity: 0 }} animate={{ opacity: 0.4 }}
          transition={{ duration: 0.8, delay: 1.2 }}
        />
        <motion.circle
          cx="620" cy="260" r="2" fill="#10b981"
          initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}
          transition={{ duration: 0.8, delay: 1.4 }}
        />
        <motion.circle
          cx="100" cy="460" r="2" fill="#10b981"
          initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}
          transition={{ duration: 0.8, delay: 1.6 }}
        />

        <defs>
          <linearGradient id="ring-g-1" x1="0" y1="0" x2="720" y2="720">
            <stop stopColor="#10b981" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.08" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="ring-g-2" x1="720" y1="0" x2="0" y2="720">
            <stop stopColor="#10b981" stopOpacity="0.12" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.05" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="ring-g-3" x1="0" y1="360" x2="720" y2="360">
            <stop stopColor="#10b981" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.06" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="arc-g-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="arc-g-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}
