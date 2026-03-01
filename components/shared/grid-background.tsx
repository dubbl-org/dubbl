import { cn } from "@/lib/utils";

export function GridBackground({
  children,
  className,
  variant = "lines",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "lines" | "dots";
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 animate-grid-fade",
          variant === "lines" &&
            "bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]",
          variant === "dots" &&
            "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:16px_16px]"
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
