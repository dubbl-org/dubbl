"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";

import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

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
      <span className="text-sm text-muted-foreground">{r.email || "-"}</span>
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
  const { open: openDrawer } = useCreateDrawer();
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
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [search, typeFilter]);

  const customers = contacts.filter((c) => c.type === "customer" || c.type === "both");
  const suppliers = contacts.filter((c) => c.type === "supplier" || c.type === "both");

  if (loading) return <BrandLoader />;

  if (!loading && contacts.length === 0 && !search && typeFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Contacts" description="Manage your customers and suppliers in one place.">
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-12">
            <div className="grid grid-cols-3 gap-3 mb-8 w-full max-w-md opacity-40">
              {[
                { label: "Customers", color: "border-l-blue-500" },
                { label: "Suppliers", color: "border-l-orange-500" },
                { label: "Both", color: "border-l-purple-500" },
              ].map(({ label, color }) => (
                <div key={label} className={`rounded-lg border border-dashed border-l-4 ${color} p-3`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground/40 mt-0.5">0</p>
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
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
    <div className="space-y-10">
      <Section title="Overview" description="Summary of your contacts, including customers and suppliers.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Customers", count: customers.length, color: "border-l-blue-500" },
              { label: "Suppliers", count: suppliers.length, color: "border-l-orange-500" },
              { label: "Total", count: contacts.length, color: "border-l-emerald-500" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-lg border border-l-4 ${color} bg-card p-4`}>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">{count}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => openDrawer("contact")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Contact
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Contacts" description="View, filter, and manage all your contacts.">
        <div className="space-y-4">
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
      </Section>
    </div>
    </BlurReveal>
  );
}
