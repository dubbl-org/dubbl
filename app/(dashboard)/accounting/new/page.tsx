"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntryForm } from "@/components/dashboard/entry-form";

interface Account {
  id: string;
  code: string;
  name: string;
}

export default function NewTransactionPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      });
  }, []);

  async function handleSubmit(data: {
    date: string;
    description: string;
    reference: string;
    lines: { accountId: string; description: string; debitAmount: number; creditAmount: number }[];
  }) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setLoading(true);
    try {
      const res = await fetch("/api/v1/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          date: data.date,
          description: data.description,
          reference: data.reference || null,
          lines: data.lines.map((l) => ({
            accountId: l.accountId,
            description: l.description || null,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create entry");
      }

      const { entry } = await res.json();
      toast.success("Journal entry created");
      router.push(`/accounting/${entry.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New Journal Entry"
        description="Create a balanced double-entry journal entry."
      />
      <EntryForm accounts={accounts} onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
