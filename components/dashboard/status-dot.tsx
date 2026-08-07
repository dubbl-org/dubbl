import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  partial: "bg-amber-500",
  paid: "bg-primary",
  overdue: "bg-red-500",
  void: "bg-gray-300",
  posted: "bg-primary",
  approved: "bg-primary",
  rejected: "bg-red-500",
  submitted: "bg-blue-500",
  accepted: "bg-primary",
  declined: "bg-red-500",
  expired: "bg-gray-400",
  converted: "bg-purple-500",
  unreconciled: "bg-amber-500",
  reconciled: "bg-primary",
  excluded: "bg-gray-300",
};

interface StatusDotProps {
  status: string;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full",
        STATUS_COLORS[status] || "bg-gray-400",
        className
      )}
    />
  );
}
