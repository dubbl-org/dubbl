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
      "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 px-6 text-center",
      !compact && "min-h-[50vh]"
    )}>
      <div className="flex size-12 items-center justify-center rounded-xl bg-accent dark:bg-accent">
        <Icon className="size-6 text-primary dark:text-primary" />
      </div>
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
