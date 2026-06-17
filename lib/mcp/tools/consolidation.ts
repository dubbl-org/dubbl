import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  consolidationGroup,
  consolidationGroupMember,
  consolidationEliminationRule,
  member,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { computeConsolidatedReport } from "@/lib/api/consolidation-report";
import type { AuthContext } from "@/lib/api/auth-context";

// Load a consolidation group owned by the current org (parentOrgId == ctx.org),
// with its members + their organizations. Throws if not found / not owned.
async function loadOwnedGroup(ctx: AuthContext, groupId: string) {
  const group = await db.query.consolidationGroup.findFirst({
    where: and(
      eq(consolidationGroup.id, groupId),
      eq(consolidationGroup.parentOrgId, ctx.organizationId),
      notDeleted(consolidationGroup.deletedAt)
    ),
    with: {
      members: { with: { organization: true } },
    },
  });
  if (!group) throw new Error("Consolidation group not found");
  return group;
}

export function registerConsolidationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_consolidation_groups",
    "List the multi-entity consolidation groups owned by this organization. Each group has a presentation currency (the currency the consolidated worksheet is reported in) and a set of member entities. Use this to find a group's ID before fetching its consolidated report or managing its members/elimination rules.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const groups = await db.query.consolidationGroup.findMany({
          where: and(
            eq(consolidationGroup.parentOrgId, ctx.organizationId),
            notDeleted(consolidationGroup.deletedAt)
          ),
          with: {
            members: { with: { organization: true } },
          },
          orderBy: (g, { desc }) => [desc(g.createdAt)],
        });

        return {
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            presentationCurrency: g.presentationCurrency,
            memberCount: g.members.length,
            members: g.members.map((m) => ({
              id: m.id,
              orgId: m.orgId,
              label: m.label || m.organization.name,
              orgName: m.organization.name,
              functionalCurrency:
                m.functionalCurrency || m.organization.defaultCurrency,
            })),
          })),
        };
      })
  );

  server.tool(
    "get_consolidation_report",
    "Get the consolidated P&L and balance sheet for a consolidation group over a date range. Each member entity's posted GL balances are translated from its functional currency into the group's presentation currency using IAS 21 rates (closing for assets/liabilities, average for revenue/expenses, historical for equity), then summed. The mixed-rate residual that prevents the balance sheet from footing is injected as a Cumulative Translation Adjustment (CTA, code 3900) equity line so the consolidated balance sheet FOOTS (assets = liabilities + equity incl. CTA + net income; see consolidatedBalanceSheet.balanceCheck, which should be ~0). Intercompany balances matched by the group's elimination rules (account-code prefixes) are removed, capped by the intercompany invoice/bill volume attributable to fellow members so third-party balances are never over-eliminated. This tool is READ-ONLY (it does not persist elimination entries). All amounts are in integer cents of the presentation currency.",
    {
      groupId: z.string().describe("UUID of the consolidation group to report on"),
      startDate: z
        .string()
        .optional()
        .describe(
          "Inclusive start date (YYYY-MM-DD) of the report window. Defaults to Jan 1 of the current year."
        ),
      endDate: z
        .string()
        .optional()
        .describe(
          "Inclusive end date (YYYY-MM-DD); also the period-end used to resolve translation rates. Defaults to today."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const group = await loadOwnedGroup(ctx, params.groupId);

        const startDate =
          params.startDate || `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate || new Date().toISOString().slice(0, 10);

        // Shared computation: identical translation + CTA-as-equity injection +
        // intercompany-capped eliminations as the REST report route, so the two
        // paths can never diverge. Read-only.
        return computeConsolidatedReport(group, { startDate, endDate });
      })
  );

  server.tool(
    "list_consolidation_members",
    "List the member entities of a consolidation group, including each member's functional currency (the currency that entity operates in). Use this to see which organizations are consolidated and what currency each is translated from.",
    {
      groupId: z.string().describe("UUID of the consolidation group"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const group = await loadOwnedGroup(ctx, params.groupId);
        return {
          groupId: group.id,
          presentationCurrency: group.presentationCurrency,
          members: group.members.map((m) => ({
            id: m.id,
            orgId: m.orgId,
            label: m.label || m.organization.name,
            orgName: m.organization.name,
            functionalCurrency:
              m.functionalCurrency || m.organization.defaultCurrency,
          })),
        };
      })
  );

  server.tool(
    "add_consolidation_member",
    "Add an organization as a member entity of a consolidation group. The current user must belong to the target organization. Optionally override the member's functional currency (defaults to the organization's default currency) and set a display label. The member's GL is translated into the group's presentation currency when reports are run.",
    {
      groupId: z.string().describe("UUID of the consolidation group to add to"),
      orgId: z
        .string()
        .describe(
          "UUID of the organization to add as a member. The current user must be a member of this organization."
        ),
      label: z
        .string()
        .optional()
        .describe("Optional display label for this member in reports"),
      functionalCurrency: z
        .string()
        .optional()
        .describe(
          "Optional ISO currency code overriding the member's functional currency (defaults to the org's default currency)"
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:reports");
        const group = await loadOwnedGroup(ctx, params.groupId);

        // Caller must have access to the org being added.
        const membership = await db.query.member.findFirst({
          where: and(
            eq(member.organizationId, params.orgId),
            eq(member.userId, ctx.userId)
          ),
        });
        if (!membership) {
          throw new Error(
            "You do not have access to the specified organization"
          );
        }

        const existing = await db.query.consolidationGroupMember.findFirst({
          where: and(
            eq(consolidationGroupMember.groupId, group.id),
            eq(consolidationGroupMember.orgId, params.orgId)
          ),
        });
        if (existing) {
          throw new Error("Organization is already a member of this group");
        }

        const [added] = await db
          .insert(consolidationGroupMember)
          .values({
            groupId: group.id,
            orgId: params.orgId,
            label: params.label || null,
            functionalCurrency: params.functionalCurrency || null,
          })
          .returning();

        return { member: added };
      })
  );

  server.tool(
    "remove_consolidation_member",
    "Remove a member entity from a consolidation group. This only removes the membership link; it does not affect the member organization's own data.",
    {
      groupId: z.string().describe("UUID of the consolidation group"),
      orgId: z
        .string()
        .describe("UUID of the member organization to remove from the group"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:reports");
        const group = await loadOwnedGroup(ctx, params.groupId);

        const existing = await db.query.consolidationGroupMember.findFirst({
          where: and(
            eq(consolidationGroupMember.groupId, group.id),
            eq(consolidationGroupMember.orgId, params.orgId)
          ),
        });
        if (!existing) throw new Error("Group member not found");

        await db
          .delete(consolidationGroupMember)
          .where(eq(consolidationGroupMember.id, existing.id));

        return { success: true, removedMemberId: existing.id };
      })
  );

  server.tool(
    "list_consolidation_elimination_rules",
    "List the intercompany elimination rules for a consolidation group. Each rule matches account-code prefixes (debitAccountMatch / creditAccountMatch) to net out intercompany balances (e.g. AR vs AP, intercompany sales vs COGS) when the consolidated report is produced.",
    {
      groupId: z.string().describe("UUID of the consolidation group"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const group = await loadOwnedGroup(ctx, params.groupId);
        const rules = await db.query.consolidationEliminationRule.findMany({
          where: and(
            eq(consolidationEliminationRule.groupId, group.id),
            notDeleted(consolidationEliminationRule.deletedAt)
          ),
          orderBy: (r, { asc }) => [asc(r.createdAt)],
        });
        return {
          groupId: group.id,
          rules: rules.map((r) => ({
            id: r.id,
            name: r.name,
            kind: r.kind,
            debitAccountMatch: r.debitAccountMatch,
            creditAccountMatch: r.creditAccountMatch,
            description: r.description,
          })),
        };
      })
  );

  server.tool(
    "create_consolidation_elimination_rule",
    "Create an intercompany elimination rule for a consolidation group. The rule nets matched balances when the consolidated report runs. kind is one of: 'ar_ap' (intercompany receivables vs payables), 'sales_cogs' (intercompany revenue vs expense/COGS), 'investment_equity' (stub, not computed), or 'custom'. debitAccountMatch and creditAccountMatch are account-code prefixes (e.g. '1200') identifying the two sides to eliminate against each other.",
    {
      groupId: z
        .string()
        .describe("UUID of the consolidation group to add the rule to"),
      name: z.string().describe("Human-readable name for the rule"),
      kind: z
        .enum(["ar_ap", "sales_cogs", "investment_equity", "custom"])
        .describe(
          "Elimination kind: ar_ap, sales_cogs, investment_equity (stub), or custom"
        ),
      debitAccountMatch: z
        .string()
        .optional()
        .describe(
          "Account-code prefix for the debit side to eliminate (e.g. '1200' for intercompany AR)"
        ),
      creditAccountMatch: z
        .string()
        .optional()
        .describe(
          "Account-code prefix for the credit side to eliminate (e.g. '2100' for intercompany AP)"
        ),
      description: z
        .string()
        .optional()
        .describe("Optional longer description of what this rule eliminates"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:reports");
        const group = await loadOwnedGroup(ctx, params.groupId);

        const [rule] = await db
          .insert(consolidationEliminationRule)
          .values({
            groupId: group.id,
            name: params.name,
            kind: params.kind,
            debitAccountMatch: params.debitAccountMatch || null,
            creditAccountMatch: params.creditAccountMatch || null,
            description: params.description || null,
          })
          .returning();

        return { rule };
      })
  );

  server.tool(
    "delete_consolidation_elimination_rule",
    "Soft-delete an intercompany elimination rule from a consolidation group. The rule will no longer be applied when consolidated reports run.",
    {
      groupId: z.string().describe("UUID of the consolidation group"),
      ruleId: z.string().describe("UUID of the elimination rule to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:reports");
        const group = await loadOwnedGroup(ctx, params.groupId);

        const rule = await db.query.consolidationEliminationRule.findFirst({
          where: and(
            eq(consolidationEliminationRule.id, params.ruleId),
            eq(consolidationEliminationRule.groupId, group.id),
            notDeleted(consolidationEliminationRule.deletedAt)
          ),
        });
        if (!rule) throw new Error("Elimination rule not found");

        await db
          .update(consolidationEliminationRule)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(consolidationEliminationRule.id, rule.id));

        return { success: true, deletedRuleId: rule.id };
      })
  );
}
