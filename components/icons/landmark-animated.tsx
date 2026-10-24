"use client";

import type { Transition } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface LandmarkAnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LandmarkAnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const TRANSITION: Transition = {
  type: "tween",
  duration: 0.4,
  ease: "easeOut",
};

const LandmarkAnimatedIcon = forwardRef<LandmarkAnimatedIconHandle, LandmarkAnimatedIconProps>(
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
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            d="M3 22h18"
            animate={controls}
            transition={TRANSITION}
            variants={{
              normal: { y: 0 },
              animate: { y: 0 },
            }}
          />
          <motion.path
            d="M6 18v-7"
            animate={controls}
            transition={{ ...TRANSITION, delay: 0.05 }}
            variants={{
              normal: { scaleY: 1 },
              animate: { scaleY: [0.5, 1.1, 1] },
            }}
          />
          <motion.path
            d="M10 18v-7"
            animate={controls}
            transition={{ ...TRANSITION, delay: 0.1 }}
            variants={{
              normal: { scaleY: 1 },
              animate: { scaleY: [0.5, 1.1, 1] },
            }}
          />
          <motion.path
            d="M14 18v-7"
            animate={controls}
            transition={{ ...TRANSITION, delay: 0.15 }}
            variants={{
              normal: { scaleY: 1 },
              animate: { scaleY: [0.5, 1.1, 1] },
            }}
          />
          <motion.path
            d="M18 18v-7"
            animate={controls}
            transition={{ ...TRANSITION, delay: 0.2 }}
            variants={{
              normal: { scaleY: 1 },
              animate: { scaleY: [0.5, 1.1, 1] },
            }}
          />
          <motion.path
            d="M12 2 3 9h18Z"
            animate={controls}
            transition={TRANSITION}
            variants={{
              normal: { y: 0 },
              animate: { y: [0, -2, 0] },
            }}
          />
        </svg>
      </div>
    );
  }
);

LandmarkAnimatedIcon.displayName = "LandmarkAnimatedIcon";

export { LandmarkAnimatedIcon };
