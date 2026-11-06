"use client";

import { useEffect, useRef } from "react";
import { useApi } from "@/lib/query/use-api";
import type { LineItem } from "./line-items-editor";

interface ContactDefaultsRow {
  id: string;
  paymentTermsDays: number | null;
  isTaxExempt: boolean;
  creditLimit: number | null;
  defaultRevenueAccountId: string | null;
  defaultExpenseAccountId: string | null;
  defaultTaxRateId: string | null;
}

/**
 * The bookkeeping defaults set on a contact (Contacts → Bookkeeping), applied
 * to a document being created for them: lines without an account get the
 * contact's income (sales) or spending (purchase) account, lines without a tax
 * rate get the contact's default rate, and sales to a contact marked
 * "Don't charge tax" carry no tax at all. Runs when the contact changes;
 * anything the user already picked is kept.
 *
 * Returns what LineItemsEditor needs for new lines, and the contact's payment
 * terms (days) and credit limit (cents) for the caller.
 */
export function useContactDefaults(
  contactId: string,
  kind: "sales" | "purchase",
  setLines: (update: (prev: LineItem[]) => LineItem[]) => void
) {
  const { data } = useApi<{ contact?: ContactDefaultsRow }>(contactId ? `/api/v1/contacts/${contactId}` : null);
  const c = data?.contact && data.contact.id === contactId ? data.contact : null;

  const accountId = (kind === "sales" ? c?.defaultRevenueAccountId : c?.defaultExpenseAccountId) ?? "";
  // "Don't charge tax to this contact" only concerns what you charge them.
  const taxLocked = kind === "sales" && !!c?.isTaxExempt;
  const taxRateId = taxLocked ? "" : c?.defaultTaxRateId ?? "";

  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!c || applied.current === c.id) return;
    applied.current = c.id;
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        accountId: l.accountId || accountId,
        taxRateId: taxLocked ? "" : l.taxRateId || taxRateId,
      }))
    );
  }, [c, accountId, taxRateId, taxLocked, setLines]);

  useEffect(() => {
    if (!contactId) applied.current = null;
  }, [contactId]);

  return {
    newLineDefaults: { accountId, taxRateId },
    taxLocked,
    paymentTermsDays: c?.paymentTermsDays ?? null,
    creditLimit: c?.creditLimit ?? null,
    loaded: !!c,
  };
}
