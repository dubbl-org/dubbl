import {
  Bell,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  FileWarning,
  Gauge,
  Info,
  Landmark,
  ListTodo,
  Package,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface InboxNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Categories and types                                               */
/* ------------------------------------------------------------------ */

export type CategoryKey =
  | "receivables"
  | "approvals"
  | "tasks"
  | "banking"
  | "payroll"
  | "inventory"
  | "integrations"
  | "system";

export interface Category {
  key: CategoryKey;
  label: string;
  color: string;
}

/** Order here is the order of the filter list and the preferences sheet. */
export const CATEGORIES: Category[] = [
  { key: "receivables", label: "Invoices & payments", color: "#10B981" },
  { key: "approvals", label: "Approvals", color: "#8B5CF6" },
  { key: "tasks", label: "Tasks", color: "#6366F1" },
  { key: "banking", label: "Banking & budgets", color: "#0EA5E9" },
  { key: "payroll", label: "Payroll", color: "#14B8A6" },
  { key: "inventory", label: "Inventory", color: "#F59E0B" },
  { key: "integrations", label: "Integrations", color: "#F97316" },
  { key: "system", label: "System", color: "#A1A1AA" },
];

export interface TypeMeta {
  type: string;
  label: string;
  description: string;
  category: CategoryKey;
  icon: LucideIcon;
  /** Icon colour. Failures and lateness are red, warnings amber, good news green. */
  color: string;
}

export const TYPES: TypeMeta[] = [
  { type: "invoice_overdue", label: "Invoice overdue", description: "An invoice passes its due date unpaid", category: "receivables", icon: FileWarning, color: "#EF4444" },
  { type: "payment_received", label: "Payment received", description: "A customer pays one of your invoices", category: "receivables", icon: CircleDollarSign, color: "#10B981" },
  { type: "approval_needed", label: "Approval needed", description: "Something is waiting for your sign-off", category: "approvals", icon: ShieldCheck, color: "#8B5CF6" },
  { type: "task_assigned", label: "Task assigned", description: "Someone assigns you a task", category: "tasks", icon: ListTodo, color: "#6366F1" },
  { type: "low_bank_balance", label: "Low bank balance", description: "An account drops below its alert amount", category: "banking", icon: Landmark, color: "#F59E0B" },
  { type: "budget_exceeded", label: "Budget exceeded", description: "Spending reaches a budget's alert level", category: "banking", icon: Gauge, color: "#F59E0B" },
  { type: "payroll_due", label: "Payroll due", description: "A draft pay run's period ends within 3 days", category: "payroll", icon: CalendarClock, color: "#14B8A6" },
  { type: "inventory_low", label: "Low stock", description: "An item falls below its reorder point", category: "inventory", icon: Package, color: "#F59E0B" },
  { type: "stripe_payment_failed", label: "Stripe payment failed", description: "A Stripe charge or invoice payment fails", category: "integrations", icon: CreditCard, color: "#EF4444" },
  { type: "webhook_exhausted", label: "Sync events failed", description: "Stripe events fail after every retry", category: "integrations", icon: Webhook, color: "#EF4444" },
  { type: "system_alert", label: "System", description: "A backup, report or reminder fails", category: "system", icon: Info, color: "#71717A" },
];

const TYPE_MAP = new Map(TYPES.map((t) => [t.type, t]));

const FALLBACK: TypeMeta = {
  type: "other",
  label: "Notification",
  description: "",
  category: "system",
  icon: Bell,
  color: "#71717A",
};

export function typeMeta(type: string): TypeMeta {
  return TYPE_MAP.get(type) ?? FALLBACK;
}

export function categoryOf(type: string): CategoryKey {
  return typeMeta(type).category;
}

/* ------------------------------------------------------------------ */
/*  Related record                                                     */
/* ------------------------------------------------------------------ */

const ENTITY_ROUTES: Record<string, { label: string; href: (id: string) => string }> = {
  invoice: { label: "Invoice", href: (id) => `/sales/${id}` },
  quote: { label: "Quote", href: (id) => `/sales/quotes/${id}` },
  bill: { label: "Bill", href: (id) => `/purchases/${id}` },
  expense: { label: "Expense", href: (id) => `/purchases/expenses/${id}` },
  purchase_order: { label: "Purchase order", href: (id) => `/purchases/orders/${id}` },
  journal_entry: { label: "Journal entry", href: (id) => `/accounting/${id}` },
  bank_account: { label: "Bank account", href: (id) => `/accounting/banking/${id}` },
  budget: { label: "Budget", href: (id) => `/accounting/budgets/${id}` },
  budget_period: { label: "Budgets", href: () => `/accounting/budgets` },
  inventory_item: { label: "Item", href: (id) => `/inventory/${id}` },
  payroll_run: { label: "Pay run", href: (id) => `/payroll/runs/${id}` },
  project: { label: "Project", href: (id) => `/projects/${id}` },
  contact: { label: "Contact", href: (id) => `/contacts/${id}` },
  stripe_integration: { label: "Stripe", href: () => `/settings/integrations/stripe` },
  stripe_invoice: { label: "Stripe", href: () => `/settings/integrations/stripe` },
  payment_intent: { label: "Stripe", href: () => `/settings/integrations/stripe` },
};

/** Where to go when the notification doesn't point at a specific record. */
const TYPE_ROUTES: Record<string, { label: string; href: string }> = {
  invoice_overdue: { label: "Invoices", href: "/sales" },
  payment_received: { label: "Payments", href: "/sales/payments" },
  task_assigned: { label: "Projects", href: "/projects" },
  low_bank_balance: { label: "Banking", href: "/accounting/banking" },
  budget_exceeded: { label: "Budgets", href: "/accounting/budgets" },
  payroll_due: { label: "Pay runs", href: "/payroll/runs" },
  inventory_low: { label: "Inventory", href: "/inventory" },
  stripe_payment_failed: { label: "Stripe", href: "/settings/integrations/stripe" },
  webhook_exhausted: { label: "Stripe", href: "/settings/integrations/stripe" },
};

/** Document numbers people recognise, e.g. INV-00042, BILL-12, PO-3001. */
const DOC_NUMBER = /\b(?:INV|BILL|PO|QT|QUO|CN|DN|EXP|PR|GRN|JE)-\d{2,}\b/;

export interface RecordLink {
  /** Short label for the chip: a document number when we can see one, else the record kind. */
  label: string;
  mono: boolean;
  href: string | null;
}

export function recordLink(n: InboxNotification): RecordLink | null {
  const docNumber = (n.title.match(DOC_NUMBER) ?? n.body?.match(DOC_NUMBER))?.[0];
  const entity = n.entityType ? ENTITY_ROUTES[n.entityType] : undefined;
  if (entity && n.entityId) {
    return { label: docNumber ?? entity.label, mono: Boolean(docNumber), href: entity.href(n.entityId) };
  }
  const fallback = TYPE_ROUTES[n.type];
  if (docNumber) return { label: docNumber, mono: true, href: fallback?.href ?? null };
  if (fallback) return { label: fallback.label, mono: false, href: fallback.href };
  return null;
}

/* ------------------------------------------------------------------ */
/*  Time                                                               */
/* ------------------------------------------------------------------ */

const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const SHORT_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const YEAR_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const FULL_FMT = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiff(date: Date, now: Date) {
  return Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
}

/** Compact time for a row: "now", "12m", "3h", then a clock time, weekday or date. */
export function shortTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const days = dayDiff(d, now);
  if (days === 0) return `${Math.floor(mins / 60)}h`;
  if (days === 1) return TIME_FMT.format(d);
  if (days < 7) return WEEKDAY_FMT.format(d);
  if (d.getFullYear() === now.getFullYear()) return SHORT_FMT.format(d);
  return YEAR_FMT.format(d);
}

export function fullTime(iso: string) {
  return FULL_FMT.format(new Date(iso));
}

export type DayGroup = "today" | "yesterday" | "week" | "earlier";

export const DAY_GROUPS: { key: DayGroup; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "earlier", label: "Earlier" },
];

export function dayGroup(iso: string, now = new Date()): DayGroup {
  const days = dayDiff(new Date(iso), now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "earlier";
}
