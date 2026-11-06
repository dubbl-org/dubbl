/**
 * The addresses dubbl's shared Resend sender uses. Self-hosted instances set
 * them to an address on a domain verified in their own Resend account.
 */

/** System email: sign-in codes, invitations, notifications, digests. */
export function platformFromAddress() {
  return process.env.RESEND_FROM || "dubbl <noreply@dubbl.dev>";
}

/** Invoices, quotes and reminders sent without the organization's own mail server. */
export function documentsFromAddress() {
  return process.env.RESEND_DOCUMENTS_FROM || "dubbl <invoices@dubbl.dev>";
}
