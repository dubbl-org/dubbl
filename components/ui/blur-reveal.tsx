"use client";

import { createContext, useContext } from "react";
import { MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

const BlurRevealContext = createContext(false);

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
          initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "opacity, transform, filter" }}
        >
          {children}
        </motion.div>
      </MotionConfig>
    </BlurRevealContext.Provider>
  );
}
