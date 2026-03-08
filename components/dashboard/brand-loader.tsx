import { cn } from "@/lib/utils";

export function BrandLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-[60vh] items-center justify-center", className)}>
      <div className="brand-loader" aria-label="Loading">
        <div className="brand-loader-circle brand-loader-circle-1" />
        <div className="brand-loader-circle brand-loader-circle-2" />
      </div>
    </div>
  );
}
