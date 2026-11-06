import { PAID_PLANS, type PaidPlanName } from "@/lib/plans";

/*
 * A plan picked on the pricing page before the visitor had an account. It is
 * kept in localStorage through sign-up and onboarding, then opens checkout.
 */
const KEY = "dubbl:plan-intent";

export function upgradeUrl(plan: PaidPlanName, interval: "monthly" | "annual") {
  return `/settings/billing?upgrade=${plan}&interval=${interval}`;
}

function parse(plan: string | null, interval: string | null) {
  if (!plan || !(PAID_PLANS as readonly string[]).includes(plan)) return null;
  return { plan: plan as PaidPlanName, interval: interval === "monthly" ? "monthly" as const : "annual" as const };
}

export function rememberPlanIntent(plan: string | null, interval: string | null) {
  const intent = parse(plan, interval);
  if (intent) localStorage.setItem(KEY, JSON.stringify(intent));
}

/** The billing URL for a remembered plan (clearing it), or null. */
export function takePlanIntentUrl(): string | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  localStorage.removeItem(KEY);
  try {
    const { plan, interval } = JSON.parse(raw);
    const intent = parse(plan, interval);
    return intent ? upgradeUrl(intent.plan, intent.interval) : null;
  } catch {
    return null;
  }
}
