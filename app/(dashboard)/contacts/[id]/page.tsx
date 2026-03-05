"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
  notes: string | null;
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/contacts/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.contact) setContact(data.contact);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email") || null,
          phone: form.get("phone") || null,
          taxNumber: form.get("taxNumber") || null,
          type: form.get("type"),
          paymentTermsDays: parseInt(form.get("paymentTermsDays") as string) || 30,
          notes: form.get("notes") || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setContact(data.contact);
      toast.success("Contact updated");
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this contact?")) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setDeleting(true);
    try {
      await fetch(`/api/v1/contacts/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      toast.success("Contact deleted");
      router.push("/contacts");
    } finally { setDeleting(false); }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contact not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={contact.name}
        description="Edit contact details."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/contacts">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600" disabled={deleting}>
          <Trash2 className="mr-2 size-4" />
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </PageHeader>

      <Badge
        variant="outline"
        className={
          contact.type === "customer"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : contact.type === "supplier"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : "border-purple-200 bg-purple-50 text-purple-700"
        }
      >
        {contact.type}
      </Badge>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={contact.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={contact.email || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={contact.phone || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue={contact.type}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
            <Input
              id="paymentTermsDays"
              name="paymentTermsDays"
              type="number"
              min={0}
              defaultValue={contact.paymentTermsDays}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxNumber">Tax Number</Label>
            <Input id="taxNumber" name="taxNumber" defaultValue={contact.taxNumber || ""} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={contact.notes || ""} rows={3} />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
