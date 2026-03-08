export const TEMPLATE_VARS: Record<string, string> = {
  contactName: "contactName",
  documentNumber: "documentNumber",
  amountDue: "amountDue",
  dueDate: "dueDate",
  organizationName: "organizationName",
  daysOverdue: "daysOverdue",
};

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
