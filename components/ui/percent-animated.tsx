"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface PercentAnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PercentAnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PercentAnimatedIcon = forwardRef<PercentAnimatedIconHandle, PercentAnimatedIconProps>(
  ({ className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    return (
      <div className={cn(className)} {...props}>
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          variants={{
            normal: { rotate: 0 },
            animate: {
              rotate: [0, -8, 8, 0],
              transition: { type: "tween", duration: 0.5, ease: "easeInOut" },
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.line
            x1="19"
            y1="5"
            x2="5"
            y2="19"
            animate={controls}
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.05 },
              },
            }}
          />
          <motion.circle
            cx="6.5"
            cy="6.5"
            r="2.5"
            animate={controls}
            variants={{
              normal: { scale: 1, opacity: 1 },
              animate: {
                scale: [0, 1.15, 1],
                opacity: [0, 1, 1],
                transition: { duration: 0.35, delay: 0.15 },
              },
            }}
          />
          <motion.circle
            cx="17.5"
            cy="17.5"
            r="2.5"
            animate={controls}
            variants={{
              normal: { scale: 1, opacity: 1 },
              animate: {
                scale: [0, 1.15, 1],
                opacity: [0, 1, 1],
                transition: { duration: 0.35, delay: 0.25 },
              },
            }}
          />
        </motion.svg>
      </div>
    );
  }
);

PercentAnimatedIcon.displayName = "PercentAnimatedIcon";

export { PercentAnimatedIcon };
