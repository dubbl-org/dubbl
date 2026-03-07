"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Search, Loader2, MoreHorizontal, Trash2, ExternalLink, UserPlus, Building2, Truck, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { motion, MotionConfig } from "motion/react";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

function buildColumns(onDelete: (c: Contact) => void, onOpen: (c: Contact) => void): Column<Contact>[] {
  return [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
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
      sortKey: "terms",
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
      sortKey: "creditLimit",
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
      sortKey: "created",
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
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(r); }}>
              <ExternalLink className="size-4" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(r); }}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

export default function ContactsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

    let cancelled = false;
    const isRefetch = !loading;

    setPage(1);
    setHasMore(true);
    if (isRefetch) setRefetching(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("page", "1");
    params.set("limit", "50");

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setContacts(data.data);
        if (data.pagination) {
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .then(() => devDelay())
      .finally(() => { if (!cancelled) { setLoading(false); setRefetching(false); setFetchKey((k) => k + 1); } });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, typeFilter, sortBy, sortOrder, dateFrom, dateTo]);

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
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
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
  }, [loadingMore, hasMore, page, debouncedSearch, typeFilter, sortBy, sortOrder, dateFrom, dateTo]);

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

  async function handleDelete(c: Contact) {
    await confirm({
      title: `Delete "${c.name}"?`,
      description: "This contact and all associated data will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const orgId = localStorage.getItem("activeOrgId");
        if (!orgId) return;
        await fetch(`/api/v1/contacts/${c.id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        setContacts((prev) => prev.filter((x) => x.id !== c.id));
        setTotal((t) => t - 1);
        toast.success("Contact deleted");
      },
    });
  }

  const handleSort = useCallback((key: string) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
        return key;
      }
      setSortOrder("desc");
      return key;
    });
  }, []);

  const columns = buildColumns(handleDelete, (c) => router.push(`/contacts/${c.id}`));

  const customers = contacts.filter(
    (c) => c.type === "customer" || c.type === "both"
  );
  const suppliers = contacts.filter(
    (c) => c.type === "supplier" || c.type === "both"
  );
  const taxExemptCount = contacts.filter((c) => c.isTaxExempt).length;

  if (loading) return <BrandLoader />;

  /* ---------- Empty state ---------- */
  const hasFilters = dateFrom || dateTo;
  const pendingSearch = search !== debouncedSearch;

  if (contacts.length === 0 && !search && typeFilter === "all" && !refetching && !pendingSearch && !hasFilters) {
    return (
      <ContentReveal>
        <div className="relative flex min-h-[calc(100vh-8rem)] flex-col">
          {/* Background skeleton table */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-6">
            <div className="w-full max-w-3xl rounded-lg border overflow-hidden">
              {/* Header row matching DataTable */}
              <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
                <div className="h-2 w-12 rounded bg-muted-foreground/20" />
                <div className="h-2 w-8 rounded bg-muted-foreground/20" />
                <div className="h-2 w-10 rounded bg-muted-foreground/20 hidden sm:block" />
                <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
                <div className="h-2 w-12 rounded bg-muted-foreground/20" />
              </div>
              {/* Data rows */}
              {[
                { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
                { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
                { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
                { badge: "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500" },
                { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
                { badge: "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" },
                { badge: "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500" },
                { badge: "bg-orange-100 text-orange-400 dark:bg-orange-900/40 dark:text-orange-500" },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className={`h-2.5 rounded bg-muted ${i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-32" : "w-24"}`} />
                    <div className={`h-2 rounded bg-muted/50 ${i % 2 === 0 ? "w-36" : "w-28"}`} />
                  </div>
                  <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${row.badge} hidden sm:block`}>
                    {i % 3 === 0 ? "customer" : i % 3 === 1 ? "supplier" : "both"}
                  </div>
                  <div className={`h-2.5 rounded bg-muted/50 hidden sm:block ${i % 2 === 0 ? "w-20" : "w-16"}`} />
                  <div className={`h-2.5 rounded bg-muted/40 hidden sm:block ${i % 2 === 0 ? "w-16" : "w-12"}`} />
                </div>
              ))}
            </div>
            {/* Fade to background */}
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/30 via-content-bg/70 to-content-bg" />
          </div>

          {/* Top section */}
          <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
            <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50">
              <Users className="size-6 sm:size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Manage your contacts</h2>
            <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Keep track of everyone you do business with. Add customers, suppliers, or contacts that are both.
            </p>
            <Button
              onClick={() => openDrawer("contact")}
              size="lg"
              className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            >
              <UserPlus className="mr-2 size-4" />
              Add your first contact
            </Button>
          </div>

          {/* Feature cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
            {[
              {
                icon: Building2,
                title: "Customers",
                description: "Track who you sell to, their payment terms, and outstanding balances.",
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/40",
              },
              {
                icon: Truck,
                title: "Suppliers",
                description: "Manage your vendors, purchase history, and payable accounts.",
                color: "text-orange-600 dark:text-orange-400",
                bg: "bg-orange-50 dark:bg-orange-950/40",
              },
              {
                icon: ArrowRight,
                title: "Linked data",
                description: "Contacts connect to invoices, bills, and journal entries automatically.",
                color: "text-purple-600 dark:text-purple-400",
                bg: "bg-purple-50 dark:bg-purple-950/40",
              },
            ].map(({ icon: Icon, title, description, color, bg }) => (
              <div
                key={title}
                className="group rounded-xl p-4 sm:p-5"
              >
                <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`size-4.5 ${color}`} />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
      <div className="space-y-4 sm:space-y-6">
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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-[13px] text-muted-foreground">
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">From</span>
            <DatePicker
              value={dateFrom}
              onChange={(v) => setDateFrom(v)}
              placeholder="Start date"
              className="h-8 w-40 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">To</span>
            <DatePicker
              value={dateTo}
              onChange={(v) => setDateTo(v)}
              placeholder="End date"
              className="h-8 w-40 text-xs"
            />
          </div>
          <Select
            value={`${sortBy}:${sortOrder}`}
            onValueChange={(v) => {
              const [key, order] = v.split(":");
              setSortBy(key);
              setSortOrder(order as "asc" | "desc");
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created:desc">Newest first</SelectItem>
              <SelectItem value="created:asc">Oldest first</SelectItem>
              <SelectItem value="name:asc">Name (A-Z)</SelectItem>
              <SelectItem value="name:desc">Name (Z-A)</SelectItem>
              <SelectItem value="terms:asc">Shortest terms</SelectItem>
              <SelectItem value="terms:desc">Longest terms</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="mr-1 size-3" />
              Clear dates
            </Button>
          )}
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
              className="overflow-x-auto"
            >
              <DataTable
                columns={columns}
                data={contacts}
                loading={loading}
                emptyMessage="No contacts found."
                onRowClick={(r) => router.push(`/contacts/${r.id}`)}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
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
      {confirmDialog}
    </ContentReveal>
  );
}
