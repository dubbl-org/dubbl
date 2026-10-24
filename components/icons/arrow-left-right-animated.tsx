"use client";

import type { Transition } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ArrowLeftRightAnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ArrowLeftRightAnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const TRANSITION: Transition = {
  type: "tween",
  duration: 0.35,
  ease: "easeInOut",
};

const ArrowLeftRightAnimatedIcon = forwardRef<ArrowLeftRightAnimatedIconHandle, ArrowLeftRightAnimatedIconProps>(
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
          <motion.g
            animate={controls}
            transition={TRANSITION}
            variants={{
              normal: { x: 0 },
              animate: { x: [0, -2, 0] },
            }}
          >
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
          </motion.g>
          <motion.g
            animate={controls}
            transition={TRANSITION}
            variants={{
              normal: { x: 0 },
              animate: { x: [0, 2, 0] },
            }}
          >
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </motion.g>
        </svg>
      </div>
    );
  }
);

ArrowLeftRightAnimatedIcon.displayName = "ArrowLeftRightAnimatedIcon";

export { ArrowLeftRightAnimatedIcon };
