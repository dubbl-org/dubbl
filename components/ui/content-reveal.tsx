"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Like BlurReveal but always animates on mount (no nesting check).
 * Use for content that appears after a loading state, where the
 * layout-level BlurReveal has already animated the loader.
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
      initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: "opacity, transform, filter" }}
    >
      {children}
    </motion.div>
  );
}
