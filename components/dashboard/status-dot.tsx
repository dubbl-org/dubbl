import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  partial: "bg-amber-500",
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
  void: "bg-gray-300",
  posted: "bg-emerald-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  submitted: "bg-blue-500",
  accepted: "bg-emerald-500",
  declined: "bg-red-500",
  expired: "bg-gray-400",
  converted: "bg-purple-500",
  unreconciled: "bg-amber-500",
  reconciled: "bg-emerald-500",
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
