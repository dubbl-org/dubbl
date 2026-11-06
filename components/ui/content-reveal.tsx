"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Like BlurReveal but always fades on mount (no nesting check). Use for content
 * that appears after a loading state. Brief, so cached pages still feel instant.
 */
export function ContentReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
