"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  Users,
  Plus,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  employeeNumber: string;
  position: string | null;
  salary: number;
  payFrequency: string;
  isActive: boolean;
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "number" | "salary" | "startDate";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "number", label: "Employee #" },
  { value: "salary", label: "Salary" },
  { value: "startDate", label: "Start Date" },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function EmployeesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Search, filter, sort
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const fetchEmployees = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const isRefetch = !loading;
    if (isRefetch) setRefetching(true);

    fetch("/api/v1/payroll/employees", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setEmployees(data.data || []);
      })
      .finally(() => {
        setLoading(false);
        setRefetching(false);
        setFetchKey((k) => k + 1);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchEmployees();
    const handler = () => fetchEmployees();
    window.addEventListener("refetch-employees", handler);
    return () => window.removeEventListener("refetch-employees", handler);
  }, [fetchEmployees]);

  // Re-animate on filter/sort/search changes
  useEffect(() => {
    if (!loading) setFetchKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, debouncedSearch]);

  // Client-side filtering + sorting
  const filtered = employees
    .filter((e) => {
      if (statusFilter === "active" && !e.isActive) return false;
      if (statusFilter === "inactive" && e.isActive) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const nameMatch = e.name.toLowerCase().includes(q);
        const numMatch = e.employeeNumber.toLowerCase().includes(q);
        const posMatch = e.position?.toLowerCase().includes(q);
        if (!nameMatch && !numMatch && !posMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "number":
          return dir * a.employeeNumber.localeCompare(b.employeeNumber);
        case "salary":
          return dir * (a.salary - b.salary);
        case "startDate":
          return dir * a.employeeNumber.localeCompare(b.employeeNumber);
        case "name":
        default:
          return dir * a.name.localeCompare(b.name);
      }
    });

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  if (loading) return <BrandLoader />;

  if (employees.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        {/* Visual empty state */}
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/50">
          <div className="relative flex flex-col items-center py-16 px-6">
            {/* Floating avatar placeholders */}
            <div className="relative h-24 w-64 mb-6">
              {[
                { left: "10%", top: "0%", size: 44, delay: 0.2, initials: "JD" },
                { left: "38%", top: "5%", size: 52, delay: 0.1, initials: "?" },
                { left: "68%", top: "2%", size: 40, delay: 0.3, initials: "AK" },
              ].map((avatar, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.5, delay: avatar.delay, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "absolute flex items-center justify-center rounded-full font-semibold",
                    i === 1
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-100/50 dark:ring-emerald-900/30 text-base"
                      : "bg-muted text-muted-foreground/40 text-xs ring-2 ring-muted/50"
                  )}
                  style={{
                    left: avatar.left,
                    top: avatar.top,
                    width: avatar.size,
                    height: avatar.size,
                  }}
                >
                  {avatar.initials}
                </motion.div>
              ))}
              {/* Connecting dotted lines */}
              <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.15 }}>
                <line x1="25%" y1="50%" x2="50%" y2="50%" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="50%" y1="50%" x2="78%" y2="50%" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
              </svg>
            </div>

            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="text-lg font-semibold"
            >
              Build your team
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-2 max-w-sm text-sm text-muted-foreground text-center leading-relaxed"
            >
              Add employees with their compensation details, pay frequency, and tax information to start managing payroll.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="mt-6"
            >
              <Button
                size="lg"
                onClick={() => openDrawer("employee")}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                Add Employee
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Ghost list rows */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10"
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ opacity: 1 - i * 0.2 }}>
              <div className="size-9 rounded-full bg-muted/40" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-muted/40" />
                <div className="h-3 w-20 rounded bg-muted/30" />
              </div>
              <div className="hidden sm:flex items-center gap-3">
                <div className="h-3.5 w-16 rounded bg-muted/30" />
                <div className="h-5 w-14 rounded-full bg-muted/25" />
              </div>
            </div>
          ))}
        </motion.div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("employee")}
          >
            <Plus className="size-3" />
            Add Employee
          </Button>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, number, or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={toggleSortOrder}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Employee list */}
      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <ContentReveal key={fetchKey}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No employees found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No employees match this filter"}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="rounded-xl border bg-card divide-y">
              {filtered.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => router.push(`/payroll/employees/${emp.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {getInitials(emp.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {emp.position || emp.employeeNumber}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</p>
                      <p className="text-xs text-muted-foreground capitalize">{emp.payFrequency}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono tabular-nums">{formatMoney(emp.salary)}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        emp.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                      )}
                    >
                      {emp.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </MotionConfig>
      )}
    </ContentReveal>
  );
}
