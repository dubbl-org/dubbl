export const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
] as const;

/**
 * Days until due for an organization's default payment-terms code
 * ("net_30" → 30, "due_on_receipt" → 0; a bare number is taken as days).
 * Null when the code is empty or unknown.
 */
export function paymentTermsCodeToDays(code: string | null | undefined): number | null {
  if (!code) return null;
  if (code === "due_on_receipt") return 0;
  const m = /^(?:net_)?(\d+)$/.exec(code.trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Days until due for a new invoice: the contact's own terms when set, else the
 * organization's default terms, else 30.
 */
export function resolveTermsDays(contactDays: number | null | undefined, orgTermsCode: string | null | undefined): number {
  if (contactDays != null) return contactDays;
  return paymentTermsCodeToDays(orgTermsCode) ?? 30;
}
