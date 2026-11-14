"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ReceiptAnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ReceiptAnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ReceiptAnimatedIcon = forwardRef<ReceiptAnimatedIconHandle, ReceiptAnimatedIconProps>(
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
            normal: { y: 0 },
            animate: {
              y: [0, -2, 0],
              transition: { type: "tween", duration: 0.4, ease: "easeInOut" },
            },
          }}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <motion.path
            d="M14 8H8"
            animate={controls}
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.1 },
              },
            }}
          />
          <motion.path
            d="M16 12H8"
            animate={controls}
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.2 },
              },
            }}
          />
          <motion.path
            d="M13 16H8"
            animate={controls}
            variants={{
              normal: { pathLength: 1, opacity: 1 },
              animate: {
                pathLength: [0, 1],
                opacity: [0, 1],
                transition: { duration: 0.3, delay: 0.3 },
              },
            }}
          />
        </motion.svg>
      </div>
    );
  }
);

ReceiptAnimatedIcon.displayName = "ReceiptAnimatedIcon";

export { ReceiptAnimatedIcon };
