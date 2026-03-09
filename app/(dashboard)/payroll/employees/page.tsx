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
import { PageHeader } from "@/components/dashboard/page-header";
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
        <PageHeader
          title="Employees"
          description="Manage your payroll employees."
        />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Users className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No employees yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first employee to get started with payroll.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("employee")}
          >
            <Plus className="mr-2 size-4" />
            Add Employee
          </Button>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your payroll employees."
      />

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
