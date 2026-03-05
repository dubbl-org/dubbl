import { Skeleton } from "@/components/ui/skeleton";
import { Section } from "@/components/dashboard/section";

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="size-4 rounded" />
      </div>
      <div className="mt-2 space-y-1">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

function TableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  const widths = ["w-24", "w-32", "w-20", "w-28", "w-16"];
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/50 px-4 h-10 flex items-center gap-8">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-8 px-4 h-12 border-t">
          {Array.from({ length: columns }).map((_, ci) => (
            <Skeleton key={ci} className={`h-4 ${widths[ci % widths.length]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TabsSkeleton() {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
      <Skeleton className="h-7 w-14 rounded-md" />
      <Skeleton className="h-7 w-16 rounded-md" />
      <Skeleton className="h-7 w-14 rounded-md" />
    </div>
  );
}

function ButtonSkeleton() {
  return <Skeleton className="h-8 w-28 rounded-md" />;
}

export function PageSkeleton({ variant = "default" }: { variant?: "default" | "dashboard" | "settings" | "reports" | "list-2" }) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6">
        {/* Banner skeleton */}
        <Skeleton className="h-40 w-full rounded-2xl" />

        {/* 5 stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        {/* Financial health cards */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <Skeleton className="h-3 w-32" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-3/4 rounded-full" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-2 gap-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-24" />
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <Skeleton key={j} className="h-1.5 rounded-full" style={{ width: `${80 - j * 20}%` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
            <TableSkeleton columns={5} />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "reports") {
    return (
      <div className="space-y-10">
        {Array.from({ length: 3 }).map((_, si) => (
          <div key={si}>
            {si > 0 && <div className="mb-10 h-px bg-border" />}
            <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: si === 0 ? 4 : 2 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border/50 bg-card/80 p-6">
                    <Skeleton className="size-10 rounded-lg" />
                    <Skeleton className="mt-4 h-4 w-24" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "settings") {
    return (
      <div className="space-y-10">
        {Array.from({ length: 4 }).map((_, si) => (
          <div key={si}>
            {si > 0 && <div className="mb-10 h-px bg-border" />}
            <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: si === 0 ? 1 : 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list-2") {
    return (
      <div className="space-y-10">
        <Section title="Overview" description="Loading...">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <div className="flex justify-end">
              <ButtonSkeleton />
            </div>
          </div>
        </Section>
        <div className="h-px bg-border" />
        <Section title="Loading" description="Loading...">
          <div className="space-y-4">
            <TabsSkeleton />
            <TableSkeleton />
          </div>
        </Section>
      </div>
    );
  }

  // default: 3 stat cards + table
  return (
    <div className="space-y-10">
      <Section title="Overview" description="Loading...">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="flex justify-end">
            <ButtonSkeleton />
          </div>
        </div>
      </Section>
      <div className="h-px bg-border" />
      <Section title="Loading" description="Loading...">
        <div className="space-y-4">
          <TabsSkeleton />
          <TableSkeleton />
        </div>
      </Section>
    </div>
  );
}

export { StatCardSkeleton, TableSkeleton, TabsSkeleton, ButtonSkeleton };
