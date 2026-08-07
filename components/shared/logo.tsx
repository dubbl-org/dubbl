import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-primary",
        "h-8 w-8",
        className
      )}
    >
      <Building2 className="h-4.5 w-4.5 text-primary-foreground" />
    </div>
  );
}
