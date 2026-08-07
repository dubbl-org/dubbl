import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-input bg-background hover:bg-muted dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-muted dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        xl: "h-11 rounded-md px-8 text-base",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  loadingText,
  loadingIcon,
  spinnerClassName,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    loadingText?: React.ReactNode
    loadingIcon?: React.ReactNode
    spinnerClassName?: string
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const childNodes = React.Children.toArray(children)
  const inferredLoadingText = childNodes.find(
    (child) => typeof child === "string" && /\.\.\.$/.test(child.trim())
  )
  const inferredLoading = !asChild && !!disabled && typeof inferredLoadingText === "string"
  const isLoading = loading || inferredLoading
  const resolvedLoadingText =
    loadingText ??
    (typeof inferredLoadingText === "string" ? inferredLoadingText : children)
  const isDisabled = disabled || isLoading

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={isLoading ? "true" : undefined}
      aria-busy={isLoading ? true : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={!asChild ? isDisabled : undefined}
      {...props}
    >
      {isLoading && !asChild ? (
        <>
          {loadingIcon ?? <Loader2 className={cn("size-4 animate-spin", spinnerClassName)} />}
          {resolvedLoadingText}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
