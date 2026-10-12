import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { CHART_TEMPLATES, chartTemplateForCountry, getChartTemplate, seededAccountsFor } from "@/lib/db/chart-templates";
import { applyChartTemplate } from "@/lib/api/org-setup";
import { findAccountForCode, isCanonicalCode } from "@/lib/api/account-roles";
import { fiscalYearEndLabel, getCountrySetup } from "@/lib/country-setup";
import { COUNTRIES } from "@/lib/data/business-types";

function summarize(id: string) {
  const t = CHART_TEMPLATES[id];
  return { id: t.id, name: t.name, description: t.description, accountCount: seededAccountsFor(t).length };
}

export function registerChartTemplateTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_chart_templates",
    "List the default chart-of-accounts templates an organization can be set up with: Xero-style 3-digit charts (xero-uk, xero-au, xero-nz, xero-us, and the international xero-global / xero-global-vat / xero-global-gst) and the national charts (fr PCG, es PGC, de SKR03, se BAS, br, be PCMN, at EKR, it, pt SNC). Returns each template's id, name, description and starting account count, plus this organization's current template (null = a legacy chart from before templates existed) and the template recommended for its country.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
          columns: { chartTemplate: true, countryCode: true },
        });
        return {
          templates: Object.keys(CHART_TEMPLATES).map(summarize),
          current: org?.chartTemplate ?? null,
          recommended: chartTemplateForCountry(org?.countryCode).id,
        };
      }),
  );

  server.tool(
    "get_chart_template",
    "Get every account in a default chart-of-accounts template: code, name, type (asset/liability/equity/revenue/expense), subType, roles (the canonical generic codes the account stands in for, e.g. ['1200'] = accounts receivable) and defaultTax (standard / exempt / none = which of the org's tax rates lines coded there default to). Also returns the on-demand accounts that are created only when first needed (goods received not invoiced, customer deposits…). Pass templateId, or country to get that country's default template.",
    {
      templateId: z.string().optional().describe("Template id from list_chart_templates, e.g. 'xero-uk'"),
      country: z.string().length(2).optional().describe("Two-letter ISO country code; used when templateId is omitted"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const t = params.templateId ? getChartTemplate(params.templateId) : chartTemplateForCountry(params.country);
        if (!t) throw new Error(`Unknown chart template "${params.templateId}"`);
        const shape = (a: { code: string; name: string; type: string; subType: string; roles?: string[]; tax?: string }) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          subType: a.subType,
          roles: a.roles ?? [],
          defaultTax: a.tax ?? null,
        });
        return {
          ...summarize(t.id),
          accounts: seededAccountsFor(t).map(shape),
          onDemand: t.onDemand.map(shape),
        };
      }),
  );

  server.tool(
    "get_country_setup_defaults",
    "Get the setup defaults dubbl applies for a country (as Xero does): default chart template, local tax name (VAT, GST, TVA, Sales Tax…), tax regime (vat / gst / us_sales_tax / null = no standard rates), usual financial-year start month (1-12) and year-end label, the label and example format of the business tax number (e.g. ABN, EIN, VAT registration number), whether a cash-accounting VAT/GST scheme exists, and the default currency. Omit country to use this organization's country.",
    {
      country: z.string().length(2).optional().describe("Two-letter ISO country code; defaults to the organization's country"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        let code = params.country;
        if (!code) {
          const org = await db.query.organization.findFirst({
            where: eq(organization.id, ctx.organizationId),
            columns: { countryCode: true },
          });
          code = org?.countryCode ?? "";
        }
        const setup = getCountrySetup(code);
        return {
          ...setup,
          fiscalYearEnd: fiscalYearEndLabel(setup.fiscalYearStartMonth),
          defaultCurrency: COUNTRIES.find((c) => c.code === setup.code)?.defaultCurrency ?? null,
        };
      }),
  );

  server.tool(
    "apply_chart_template",
    "Switch this organization to a default chart-of-accounts template (see list_chart_templates). Only allowed while the organization has no posted transactions: it removes the auto-created default accounts, adds the template's accounts as locked system accounts, and keeps any accounts the user created. Requires the manage:accounts permission. Returns the applied template summary.",
    {
      templateId: z.string().describe("Template id from list_chart_templates, e.g. 'xero-uk' or 'fr'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accounts");
        const t = await applyChartTemplate(ctx.organizationId, params.templateId);
        return summarize(t.id);
      }),
  );

  server.tool(
    "find_account_by_role",
    "Find the organization's account that plays a standard role, given its canonical generic code — e.g. 1200 accounts receivable, 2100 accounts payable, 2200 output VAT/GST, 1500 input VAT/GST, 1100 main bank, 3100 retained earnings, 4000 sales, 5000 cost of goods sold. On a Xero-style chart 1200 resolves to 610 Accounts Receivable (UK) or 120 (US); on a legacy chart the code itself. Returns { id, code, name, type, subType, roles } or null when the org has no such account yet.",
    {
      code: z.string().describe("Canonical generic code of the role, e.g. '1200'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        if (!isCanonicalCode(params.code)) {
          throw new Error(`${params.code} is not a standard role code (try 1200, 2100, 2200, 1500, 1100, 3100, 4000, 5000)`);
        }
        const a = await findAccountForCode(ctx.organizationId, params.code);
        return a && !a.deletedAt
          ? { id: a.id, code: a.code, name: a.name, type: a.type, subType: a.subType, roles: a.roles ?? [] }
          : null;
      }),
  );
}
