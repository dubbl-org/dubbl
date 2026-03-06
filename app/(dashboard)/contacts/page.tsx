"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, Search, Loader2 } from "lucide-react";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { motion, MotionConfig } from "motion/react";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
  creditLimit: number | null;
  isTaxExempt: boolean;
  currencyCode: string | null;
  createdAt: string;
}

const typeBadgeClass: Record<Contact["type"], string> = {
  customer: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  supplier: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  both: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

const columns: Column<Contact>[] = [
  {
    key: "name",
    header: "Name",
    render: (r) => (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{r.name}</p>
        {r.email && (
          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
        )}
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={typeBadgeClass[r.type]}>
        {r.type}
      </Badge>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    className: "w-36",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.phone || "-"}</span>
    ),
  },
  {
    key: "terms",
    header: "Payment Terms",
    className: "w-36",
    render: (r) => (
      <span className="text-sm text-muted-foreground">
        {r.paymentTermsDays === 0 ? "Due on receipt" : `Net ${r.paymentTermsDays}`}
      </span>
    ),
  },
  {
    key: "creditLimit",
    header: "Credit Limit",
    className: "w-32 text-right",
    render: (r) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {r.creditLimit != null
          ? formatMoney(r.creditLimit, r.currencyCode || "USD")
          : "No limit"}
      </span>
    ),
  },
  {
    key: "taxExempt",
    header: "Tax Exempt",
    className: "w-28 text-center",
    render: (r) =>
      r.isTaxExempt ? (
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          Exempt
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground">-</span>
      ),
  },
  {
    key: "currency",
    header: "Currency",
    className: "w-24 text-center",
    render: (r) => (
      <span className="text-xs font-medium text-muted-foreground">
        {r.currencyCode || "-"}
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "Created",
    className: "w-28 text-right",
    render: (r) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {new Date(r.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    ),
  },
];

export default function ContactsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset and fetch page 1 when filters change
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    if (!loading) setRefetching(true);
    setPage(1);
    setHasMore(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter !== "all") params.set("type", typeFilter);
    params.set("page", "1");
    params.set("limit", "50");

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContacts(data.data);
        if (data.pagination) {
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .then(() => devDelay())
      .finally(() => { setLoading(false); setRefetching(false); setFetchKey((k) => k + 1); });
  }, [debouncedSearch, typeFilter]);

  // Load next page
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const nextPage = page + 1;
    setLoadingMore(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter !== "all") params.set("type", typeFilter);
    params.set("page", String(nextPage));
    params.set("limit", "50");

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContacts((prev) => [...prev, ...data.data]);
        if (data.pagination) {
          setPage(data.pagination.page);
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, page, debouncedSearch, typeFilter]);

  // IntersectionObserver to trigger loadMore
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const customers = contacts.filter(
    (c) => c.type === "customer" || c.type === "both"
  );
  const suppliers = contacts.filter(
    (c) => c.type === "supplier" || c.type === "both"
  );
  const taxExemptCount = contacts.filter((c) => c.isTaxExempt).length;

  if (loading) return <BrandLoader />;

  /* ---------- Empty state ---------- */
  const pendingSearch = search !== debouncedSearch;

  if (contacts.length === 0 && !search && typeFilter === "all" && !refetching && !pendingSearch) {
    return (
      <BlurReveal className="space-y-8">
        <PageHeader
          title="Contacts"
          description="Manage your customers and suppliers in one place."
        />

        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-12">
          <div className="grid grid-cols-3 gap-3 mb-8 w-full max-w-md opacity-40">
            {[
              { label: "Customers", color: "border-l-blue-500" },
              { label: "Suppliers", color: "border-l-orange-500" },
              { label: "Both", color: "border-l-purple-500" },
            ].map(({ label, color }) => (
              <div
                key={label}
                className={`rounded-lg border border-dashed border-l-4 ${color} p-3`}
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground/40 mt-0.5">
                  0
                </p>
              </div>
            ))}
          </div>
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
            <Users className="size-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-sm font-medium">No contacts yet</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Add your first customer or supplier to get started.
          </p>
          <div className="mt-4">
            <Button
              onClick={() => openDrawer("contact")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Contact
            </Button>
          </div>
        </div>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Contacts"
          description="Manage your customers, suppliers, and business relationships."
        >
          <Tabs value={typeFilter} onValueChange={setTypeFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="customer">Customers</TabsTrigger>
              <TabsTrigger value="supplier">Suppliers</TabsTrigger>
            </TabsList>
          </Tabs>
        </PageHeader>

        {/* Summary + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{total}</span> contacts
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-500" />
              <span className="tabular-nums">{customers.length}</span> customers
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-orange-500" />
              <span className="tabular-nums">{suppliers.length}</span> suppliers
            </span>
            {taxExemptCount > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-violet-500" />
                  <span className="tabular-nums">{taxExemptCount}</span> tax exempt
                </span>
              </>
            )}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        {refetching || pendingSearch ? (
          <div className="flex items-center justify-center py-20">
            <div className="brand-loader" aria-label="Loading">
              <div className="brand-loader-circle brand-loader-circle-1" />
              <div className="brand-loader-circle brand-loader-circle-2" />
            </div>
          </div>
        ) : (
          <MotionConfig reducedMotion="never">
            <motion.div
              key={fetchKey}
              initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              style={{ willChange: "opacity, transform, filter" }}
            >
              <DataTable
                columns={columns}
                data={contacts}
                loading={loading}
                emptyMessage="No contacts found."
                onRowClick={(r) => router.push(`/contacts/${r.id}`)}
              />
            </motion.div>
          </MotionConfig>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && !refetching && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore && (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>
    </BlurReveal>
  );
}
