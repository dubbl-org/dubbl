"use client";

import { useState, useEffect } from "react";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  userName: string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: "border-green-200 bg-green-50 text-green-700",
  update: "border-blue-200 bg-blue-50 text-blue-700",
  delete: "border-red-200 bg-red-50 text-red-700",
  post: "border-purple-200 bg-purple-50 text-purple-700",
  void: "border-orange-200 bg-orange-50 text-orange-700",
  approve: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const ENTITY_TYPES = [
  "invoice",
  "bill",
  "contact",
  "journal_entry",
  "account",
  "quote",
  "purchase_order",
];

const ACTIONS = ["create", "update", "delete", "post", "void", "approve"];

const columns: Column<AuditEntry>[] = [
  {
    key: "createdAt",
    header: "Timestamp",
    className: "w-44",
    render: (r) => (
      <span className="text-sm text-muted-foreground">
        {new Date(r.createdAt).toLocaleString()}
      </span>
    ),
  },
  {
    key: "userName",
    header: "User",
    render: (r) => <span className="text-sm font-medium">{r.userName}</span>,
  },
  {
    key: "action",
    header: "Action",
    className: "w-28",
    render: (r) => (
      <Badge
        variant="outline"
        className={ACTION_COLORS[r.action] || ""}
      >
        {r.action}
      </Badge>
    ),
  },
  {
    key: "entityType",
    header: "Entity Type",
    className: "w-36",
    render: (r) => (
      <span className="text-sm text-muted-foreground">
        {r.entityType.replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "entityId",
    header: "Entity ID",
    className: "w-36",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entityId.slice(0, 12)}...
      </span>
    ),
  },
  {
    key: "ipAddress",
    header: "IP",
    className: "w-32",
    render: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.ipAddress || "--"}
      </span>
    ),
  },
];

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;

    const params = new URLSearchParams();
    if (entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
    if (actionFilter !== "all") params.set("action", actionFilter);

    fetch(`/api/v1/audit-log?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setEntries(data.data);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityTypeFilter, actionFilter]);

  const filtered = search
    ? entries.filter(
        (e) =>
          e.userName.toLowerCase().includes(search.toLowerCase()) ||
          e.entityId.toLowerCase().includes(search.toLowerCase()) ||
          e.entityType.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  if (
    !loading &&
    entries.length === 0 &&
    !search &&
    entityTypeFilter === "all" &&
    actionFilter === "all"
  ) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Log"
          description="Track all changes across your organization."
        />
        <EmptyState
          icon={ScrollText}
          title="No audit entries yet"
          description="Activity will appear here as changes are made."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Track all changes across your organization."
      />

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by user, entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyMessage="No audit entries found."
      />
    </div>
  );
}
