export const TEMPLATE_VARS: Record<string, string> = {
  contactName: "contactName",
  documentNumber: "documentNumber",
  amountDue: "amountDue",
  dueDate: "dueDate",
  organizationName: "organizationName",
  daysOverdue: "daysOverdue",
};

/**
 * Other names people (and older templates) use for the same placeholders, so
 * e.g. {{invoiceNumber}} or {{orgName}} fill in instead of going out raw.
 */
export const TEMPLATE_VAR_ALIASES: Record<string, string> = {
  invoiceNumber: "documentNumber",
  billNumber: "documentNumber",
  number: "documentNumber",
  amount: "amountDue",
  balance: "amountDue",
  balanceDue: "amountDue",
  orgName: "organizationName",
  companyName: "organizationName",
  businessName: "organizationName",
  customerName: "contactName",
  supplierName: "contactName",
};

/**
 * Fill {{placeholders}} (spaces inside the braces allowed). Unknown
 * placeholders are left as they are.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key: string) => {
    if (key in vars) return vars[key];
    const alias = TEMPLATE_VAR_ALIASES[key];
    if (alias && alias in vars) return vars[alias];
    return match;
  });
}
