"use client";

import { createContext, useContext } from "react";
import { MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

const BlurRevealContext = createContext(false);

/** Fades a page or tab in. Kept short: switching views should feel instant. */
export function BlurReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isNested = useContext(BlurRevealContext);

  if (isNested) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <BlurRevealContext.Provider value={true}>
      <MotionConfig reducedMotion="never">
        <motion.div
          className={cn(className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </MotionConfig>
    </BlurRevealContext.Provider>
  );
}
