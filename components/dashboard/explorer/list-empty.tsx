import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A quiet first-run state for an explorer list: heading, one line of help and an optional next step. */
export function ListEmpty({
  title,
  heading,
  description,
  icon: Icon,
  children,
}: {
  /** Page title shown above the empty box, matching the explorer heading. */
  heading: string;
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{heading}</h2>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.045] text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <p className="mt-4 text-[14px] font-medium">{title}</p>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
