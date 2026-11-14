"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const button3dVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 cursor-pointer before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b before:from-white/[0.12] before:to-transparent",
  {
    variants: {
      variant: {
        primary: [
          "bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700",
          "text-white",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_1px_2px_0_rgba(0,0,0,0.05),0_2px_4px_0_rgba(5,150,105,0.15),0_4px_8px_-2px_rgba(5,150,105,0.2)]",
          "hover:translate-y-[-1px] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_2px_4px_0_rgba(0,0,0,0.05),0_4px_8px_0_rgba(5,150,105,0.2),0_8px_16px_-4px_rgba(5,150,105,0.25)]",
          "active:translate-y-[0px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(5,150,105,0.1)]",
        ],
        secondary: [
          "bg-white/90 backdrop-blur-sm",
          "text-gray-800",
          "border border-gray-200/80",
          "shadow-[0_1px_2px_0_rgba(0,0,0,0.04),0_2px_4px_-1px_rgba(0,0,0,0.04),0_4px_6px_-2px_rgba(0,0,0,0.02)]",
          "hover:translate-y-[-1px] hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06),0_4px_8px_-2px_rgba(0,0,0,0.06),0_8px_16px_-4px_rgba(0,0,0,0.04)] hover:border-gray-300/80",
          "active:translate-y-[0px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.04),0_1px_3px_-1px_rgba(0,0,0,0.03)]",
        ],
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

function Button3D({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof button3dVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button-3d"
      data-variant={variant}
      data-size={size}
      className={cn(button3dVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button3D, button3dVariants };
