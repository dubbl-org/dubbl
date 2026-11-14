"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TargetIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface TargetIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const OUTER_VARIANTS: Variants = {
  normal: { scale: 1, opacity: 1 },
  animate: {
    scale: [1, 1.08, 1],
    opacity: [1, 0.8, 1],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
};

const INNER_VARIANTS: Variants = {
  normal: { scale: 1 },
  animate: {
    scale: [1, 0.8, 1.1, 1],
    transition: { duration: 0.5, delay: 0.1, ease: "easeInOut" },
  },
};

const DOT_VARIANTS: Variants = {
  normal: { scale: 1 },
  animate: {
    scale: [1, 1.5, 1],
    transition: { duration: 0.4, delay: 0.2, ease: "easeInOut" },
  },
};

const TargetIcon = forwardRef<TargetIconHandle, TargetIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
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
          <motion.circle
            cx="12"
            cy="12"
            r="10"
            animate={controls}
            variants={OUTER_VARIANTS}
          />
          <motion.circle
            cx="12"
            cy="12"
            r="6"
            animate={controls}
            variants={INNER_VARIANTS}
          />
          <motion.circle
            cx="12"
            cy="12"
            r="2"
            animate={controls}
            variants={DOT_VARIANTS}
          />
        </svg>
      </div>
    );
  }
);

TargetIcon.displayName = "TargetIcon";

export { TargetIcon };
