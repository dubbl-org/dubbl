import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { getBillingSummary, serializeLimits } from "@/lib/api/billing-summary";
import { startPlanCheckout } from "@/lib/api/billing-checkout";
import { PAID_PLANS, PLAN_INFO, PLAN_LIMITS, PLAN_ORDER, PLAN_PRICES } from "@/lib/plans";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerBillingTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_subscription",
    "Get this organization's subscription: plan (free, standard, premium or ultimate), display name, status, billing interval, renewal date, every plan limit and current usage (users, payroll employees, bank accounts, projects, storage bytes, emails sent this month). Limits and usage maxima of null mean unlimited. Use this before creating records that might hit a plan limit, or to explain why one was blocked.",
    {},
    () => wrapTool(ctx, async () => getBillingSummary(ctx.organizationId))
  );

  server.tool(
    "list_plans",
    "List the available plans. Plans are priced per organization (never per user) in whole US dollars per month: 'monthly' when billed monthly, 'annual' the monthly equivalent when billed yearly. Returns each plan's name, tagline, prices, highlights and limits (null = unlimited). File storage (storageMb) and customer emails per month come with the plan; there are no add-ons.",
    {},
    () =>
      wrapTool(ctx, async () => ({
        plans: PLAN_ORDER.map((plan) => ({
          plan,
          name: PLAN_INFO[plan].name,
          tagline: PLAN_INFO[plan].tagline,
          priceUsd: PLAN_PRICES[plan],
          highlights: PLAN_INFO[plan].highlights,
          limits: serializeLimits(PLAN_LIMITS[plan]),
        })),
        enterprise: "Custom limits and contract billing are available on request at team@dubbl.dev.",
      }))
  );

  server.tool(
    "change_plan",
    "Move the organization to a paid plan. Requires the billing permission (owners). If the organization already has a paid subscription it is switched immediately with prorated charges and { updated: true } is returned. Otherwise a Stripe Checkout URL is returned as { url } — give it to the user to open and pay; the plan activates once payment completes. To downgrade to Free or cancel, the user must use the billing portal in Settings → Billing.",
    {
      plan: z.enum(PAID_PLANS).describe("Target plan: 'standard', 'premium' or 'ultimate'"),
      interval: z
        .enum(["monthly", "annual"])
        .optional()
        .default("annual")
        .describe("Billing interval; 'annual' is cheaper (default annual)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:billing");
        return startPlanCheckout(ctx.organizationId, params.plan, params.interval);
      })
  );
}
