"use client";

import { toast } from "sonner";

export interface StatementRange {
  startDate?: string;
  endDate?: string;
}

function orgId() {
  return localStorage.getItem("activeOrgId");
}

function headers(json = false): Record<string, string> {
  const id = orgId();
  return { ...(id ? { "x-organization-id": id } : {}), ...(json ? { "content-type": "application/json" } : {}) };
}

/** Email one contact their statement. Throws with the API's message on failure. */
export async function emailStatement(contactId: string, range: StatementRange = {}) {
  const res = await fetch(`/api/v1/contacts/${contactId}/statement/email`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(range),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't send the statement");
}

/**
 * Email statements to many contacts, three at a time. Contacts without an
 * email are skipped. Stops early when email isn't set up at all, since every
 * other send would fail the same way.
 */
export async function emailStatements(
  contacts: { id: string; name: string; email: string | null }[],
  range: StatementRange = {}
) {
  const sendable = contacts.filter((c) => c.email);
  const skipped = contacts.length - sendable.length;
  if (sendable.length === 0) {
    toast.error(contacts.length === 1 ? "This contact has no email address" : "None of these contacts have an email address");
    return false;
  }

  const toastId = toast.loading(`Sending ${sendable.length} statement${sendable.length === 1 ? "" : "s"}…`);
  let sent = 0;
  const failed: { name: string; error: string }[] = [];
  let fatal: string | null = null;

  for (let i = 0; i < sendable.length && !fatal; i += 3) {
    await Promise.all(
      sendable.slice(i, i + 3).map(async (c) => {
        try {
          await emailStatement(c.id, range);
          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Couldn't send";
          if (/not configured|smtp/i.test(message)) fatal = message;
          failed.push({ name: c.name, error: message });
        }
      })
    );
  }

  if (fatal) {
    toast.error("Email isn't set up for this workspace yet", {
      id: toastId,
      description: "Add your SMTP settings first, or download the statements as PDFs and send them yourself.",
    });
    return false;
  }
  const extra = [skipped && `${skipped} skipped (no email)`, failed.length && `${failed.length} failed`].filter(Boolean).join(" · ");
  if (sent > 0) {
    toast.success(`Sent ${sent} statement${sent === 1 ? "" : "s"}`, { id: toastId, description: extra || undefined });
  } else {
    toast.error("No statements were sent", { id: toastId, description: failed[0]?.error ?? extra });
  }
  return sent > 0;
}

/** Download one contact's statement as a PDF file. */
export async function downloadStatementPdf(contactId: string, name: string, range: StatementRange = {}) {
  const id = orgId();
  const params = new URLSearchParams({ download: "1", ...(id ? { orgId: id } : {}) });
  if (range.startDate) params.set("startDate", range.startDate);
  if (range.endDate) params.set("endDate", range.endDate);
  const res = await fetch(`/api/v1/contacts/${contactId}/statement/pdf?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`Couldn't create the statement for ${name}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || contactId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download several statements one after another. */
export async function downloadStatementPdfs(contacts: { id: string; name: string }[], range: StatementRange = {}) {
  let done = 0;
  for (const c of contacts) {
    try {
      await downloadStatementPdf(c.id, c.name, range);
      done++;
    } catch {
      toast.error(`Couldn't create the statement for ${c.name}`);
    }
  }
  if (done > 1) toast.success(`Downloaded ${done} statements`);
  return done > 0;
}

/** The full address of a portal link, for copying. */
export function portalLink(path: string) {
  return `${window.location.origin}${path}`;
}

export async function copyText(text: string, label = "Copied") {
  await navigator.clipboard.writeText(text);
  toast.success(label);
}

export interface PortalInviteResult {
  portalUrl: string;
  url: string;
  emailed: boolean;
  emailError: string | null;
}

export async function invitePortal(input: { contactId: string; expiresInDays?: number; sendEmail?: boolean; message?: string }) {
  const res = await fetch("/api/v1/portal/invite", { method: "POST", headers: headers(true), body: JSON.stringify(input) });
  const data = (await res.json().catch(() => ({}))) as PortalInviteResult & { error?: string };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't create the portal link");
  return data;
}

export async function revokePortal(accessId: string) {
  const res = await fetch(`/api/v1/portal/access/${accessId}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Couldn't switch off this link");
}

/** Statement periods offered on the Statements page. */
export const STATEMENT_PERIODS = [
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "This year" },
  { value: "q", label: "Last 3 months" },
  { value: "lastyear", label: "Last year" },
  { value: "all", label: "All time" },
] as const;

export type StatementPeriod = (typeof STATEMENT_PERIODS)[number]["value"];

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periodRange(period: StatementPeriod): StatementRange {
  const now = new Date();
  switch (period) {
    case "ytd":
      return { startDate: day(new Date(now.getFullYear(), 0, 1)), endDate: day(now) };
    case "q":
      return { startDate: day(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), endDate: day(now) };
    case "lastyear":
      return { startDate: day(new Date(now.getFullYear() - 1, 0, 1)), endDate: day(new Date(now.getFullYear() - 1, 11, 31)) };
    case "all":
      return { startDate: "2000-01-01", endDate: day(now) };
    default:
      return { startDate: day(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())), endDate: day(now) };
  }
}
