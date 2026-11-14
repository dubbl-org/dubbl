import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders.
 *
 * The app renders an empty shell and fetches its data on the client, and a
 * round trip here costs hundreds of milliseconds. A spinner says "wait"; a
 * skeleton says what is coming and reserves the space, so the screen does not
 * jump when the data lands. Prefer these over BrandLoader everywhere except
 * the auth screens, where there is no layout to preview yet.
 */

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-28" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Toolbar: search field, filters, view toggle. */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full max-w-xs rounded-md" />
      <Skeleton className="h-9 w-32 rounded-md" />
      <Skeleton className="h-9 w-24 rounded-md" />
      <div className="ml-auto flex gap-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}

/** Row-based list: contacts, documents, inventory, payroll. */
export function ListSkeleton({
  rows = 8,
  showHeader = true,
  showToolbar = true,
  className,
}: {
  rows?: number;
  showHeader?: boolean;
  showToolbar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {showHeader && <PageHeaderSkeleton />}
      {showToolbar && <ToolbarSkeleton />}
      <div className="rounded-xl border">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 13) % 35)}%` }} />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Column-based table: ledgers, banking, tax, stock. */
export function TableSkeleton({
  rows = 10,
  cols = 5,
  showHeader = true,
  className,
}: {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {showHeader && <PageHeaderSkeleton />}
      <ToolbarSkeleton />
      <div className="rounded-xl border">
        <div className="grid gap-4 border-b px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3" style={{ width: c === 0 ? "60%" : "70%" }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 border-b px-4 py-3 last:border-b-0"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-3.5"
                style={{ width: `${45 + ((r + c * 3) * 11) % 45}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid: projects, CRM pipelines, dashboards. */
export function CardsSkeleton({
  count = 6,
  showHeader = true,
  className,
}: {
  count?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {showHeader && <PageHeaderSkeleton />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-56" />
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Single record: invoices, bills, expenses, contacts. */
export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border p-5 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
          <Skeleton className="h-px w-full" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Report page: filters, then a wide table or chart block. */
export function ReportSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <PageHeaderSkeleton />
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        ))}
        <Skeleton className="ml-auto h-9 w-24 rounded-md" />
      </div>
      <StatCardsSkeleton count={3} />
      <div className="rounded-xl border p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-[280px] w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Settings screens: section list plus a form. */
export function FormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
        <div className="space-y-4 rounded-xl border p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full max-w-md rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Dashboard home: greeting, metric row, two chart panels. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border p-5 lg:col-span-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-4 h-[240px] w-full rounded-lg" />
        </div>
        <div className="space-y-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3" style={{ width: `${50 + (i * 9) % 40}%` }} />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
