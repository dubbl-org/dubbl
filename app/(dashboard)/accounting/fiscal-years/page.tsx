"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Lock, LockOpen, Plus } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDay, parseDay, toDayKey } from "@/components/dashboard/explorer/cells";
import { cn } from "@/lib/utils";

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

function headers(json = false): Record<string, string> {
  const orgId = localStorage.getItem("activeOrgId");
  return { ...(orgId ? { "x-organization-id": orgId } : {}), ...(json ? { "content-type": "application/json" } : {}) };
}

/** The year after the latest one, or the current one based on the month the business year starts. */
function suggestNext(years: FiscalYear[], startMonth: number) {
  const last = [...years].sort((a, b) => a.endDate.localeCompare(b.endDate)).at(-1);
  let start: Date;
  if (last) {
    const end = parseDay(last.endDate)!;
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  } else {
    const now = new Date();
    const year = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    start = new Date(year, startMonth - 1, 1);
  }
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
  const name = start.getMonth() === 0 ? `FY ${start.getFullYear()}` : `FY ${start.getFullYear()}–${String(end.getFullYear()).slice(2)}`;
  return { name, startDate: toDayKey(start), endDate: toDayKey(end) };
}

export default function FiscalYearsPage() {
  useDocumentTitle("Accounting · Financial years");
  const { confirm, dialog } = useConfirm();
  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [startMonth, setStartMonth] = useState(1);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fy, org] = await Promise.all([
      fetch("/api/v1/fiscal-years", { headers: headers() }).then((r) => r.json()),
      fetch("/api/v1/organization", { headers: headers() }).then((r) => r.json()).catch(() => ({})),
    ]);
    setYears(fy.fiscalYears ?? []);
    const month = org.organization?.fiscalYearStartMonth ?? org.fiscalYearStartMonth;
    if (month) setStartMonth(month);
  }, []);

  useEffect(() => {
    load().catch(() => {
      setYears([]);
      toast.error("Couldn't load your financial years");
    });
  }, [load]);

  const today = toDayKey(new Date());
  const sorted = useMemo(() => [...(years ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [years]);

  function openForm() {
    setForm(suggestNext(years ?? [], startMonth));
    setAdding(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (form.endDate <= form.startDate) return toast.error("The year has to end after it starts");
    setBusy("create");
    try {
      const res = await fetch("/api/v1/fiscal-years", { method: "POST", headers: headers(true), body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't add the year");
      toast.success(`${form.name} added`);
      setAdding(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the year");
    } finally {
      setBusy(null);
    }
  }

  async function act(year: FiscalYear, action: "close" | "reopen") {
    const ok = await confirm(
      action === "close"
        ? {
            title: `Close ${year.name}?`,
            description:
              "This moves the year's profit or loss into retained earnings with a closing entry, and locks the year so nothing dated inside it can change. You can reopen it later if you need to fix something.",
            confirmLabel: "Close the year",
          }
        : {
            title: `Reopen ${year.name}?`,
            description: "The closing entry is removed and the year is unlocked, so entries dated inside it can be changed again.",
            confirmLabel: "Reopen",
          }
    );
    if (!ok) return;
    setBusy(year.id);
    try {
      const res = await fetch(`/api/v1/fiscal-years/${year.id}/${action}`, { method: "POST", headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Something went wrong";
        throw new Error(msg === "Cannot close: draft entries exist" ? "There are draft entries dated in this year. Post or delete them first." : msg);
      }
      toast.success(action === "close" ? `${year.name} closed` : `${year.name} reopened`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (!years) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Financial years"
        description="The 12-month periods your accounts run on. Closing a year carries its profit into retained earnings and locks it."
      >
        {!adding && (
          <Button size="sm" className="h-8 gap-1.5 text-[13px]" onClick={openForm}>
            <Plus className="size-3.5" /> Add a year
          </Button>
        )}
      </PageHeader>

      {adding && (
        <form onSubmit={create} className="rounded-xl border border-border/80 p-4">
          <p className="text-[13px] font-medium">New financial year</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_160px]">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Starts</Label>
              <Input required type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ends</Label>
              <Input required type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy === "create"}>
              {busy === "create" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Add year
            </Button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border/80 px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.045] text-muted-foreground">
            <CalendarCheck2 className="size-5" />
          </span>
          <p className="mt-4 text-[14px] font-medium">No financial years yet</p>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
            Add the years you keep accounts for. When a year is over and your accountant is happy, close it so the numbers can&apos;t change by accident.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          {sorted.map((y) => {
            const current = y.startDate <= today && today <= y.endDate;
            const over = y.endDate < today;
            return (
              <div key={y.id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
                <span className={cn("flex size-8 items-center justify-center rounded-lg", y.isClosed ? "bg-foreground/[0.05] text-muted-foreground" : "bg-emerald-500/10 text-emerald-600")}>
                  {y.isClosed ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium">
                    {y.name}
                    {current && <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-[11px] font-medium text-foreground/70">Current</span>}
                  </p>
                  <p className="text-[12.5px] tabular-nums text-muted-foreground">
                    {formatDay(y.startDate)} – {formatDay(y.endDate)} · {y.isClosed ? "Closed and locked" : over ? "Over, not closed yet" : "Open"}
                  </p>
                </div>
                {y.isClosed ? (
                  <Button variant="outline" size="sm" disabled={busy === y.id} onClick={() => act(y, "reopen")}>
                    {busy === y.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Reopen
                  </Button>
                ) : (
                  <Button variant={over ? "default" : "outline"} size="sm" disabled={busy === y.id} onClick={() => act(y, "close")}>
                    {busy === y.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Close year
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        Want to stop edits up to a date without closing a whole year? Set a lock date in{" "}
        <Link href="/settings" className="underline-offset-2 hover:text-foreground hover:underline">workspace settings</Link>.
      </p>
      {dialog}
    </ContentReveal>
  );
}
