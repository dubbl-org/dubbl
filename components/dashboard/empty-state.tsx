import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  compact,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/50 py-16 px-6 text-center",
      !compact && "min-h-[50vh]"
    )}>
      <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
        <Icon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
