"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
}

const columns: Column<Contact>[] = [
  {
    key: "name",
    header: "Name",
    render: (r) => <span className="text-sm font-medium">{r.name}</span>,
  },
  {
    key: "email",
    header: "Email",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.email || "—"}</span>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    className: "w-36",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.phone || "—"}</span>
    ),
  },
  {
    key: "type",
    header: "Type",
    className: "w-28",
    render: (r) => (
      <Badge
        variant="outline"
        className={
          r.type === "customer"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : r.type === "supplier"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : "border-purple-200 bg-purple-50 text-purple-700"
        }
      >
        {r.type}
      </Badge>
    ),
  },
  {
    key: "terms",
    header: "Terms",
    className: "w-20 text-right",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.paymentTermsDays}d</span>
    ),
  },
];

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (typeFilter !== "all") params.set("type", typeFilter);

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContacts(data.data);
      })
      .finally(() => setLoading(false));
  }, [search, typeFilter]);

  if (!loading && contacts.length === 0 && !search && typeFilter === "all") {
    return (
      <div className="space-y-6">
        <PageHeader title="Contacts" description="Manage customers and suppliers." />
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Add your first customer or supplier to get started."
        >
          <Button
            onClick={() => router.push("/contacts/new")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Contact
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Contacts" description="Manage customers and suppliers.">
        <Button
          onClick={() => router.push("/contacts/new")}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Contact
        </Button>
      </PageHeader>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="customer">Customers</TabsTrigger>
            <TabsTrigger value="supplier">Suppliers</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <DataTable
        columns={columns}
        data={contacts}
        loading={loading}
        emptyMessage="No contacts found."
        onRowClick={(r) => router.push(`/contacts/${r.id}`)}
      />
    </div>
  );
}
