import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import {
  listTaxProfiles,
  getTaxProfileByCountry,
  resolveProfileForOrg,
  applyTaxProfile,
  build1099Report,
  FORM_1099_NEC_THRESHOLD_CENTS,
} from "@/lib/api/tax-profiles";

export function registerTaxProfileTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_tax_profiles",
    "List the available country tax profiles (US, GB, ZA, AU, CA, IE, IN, NL). Each profile describes a country's default tax rate set (rates in basis points, 2000 = 20%), rate kinds, periodic return boxes, and which GL control accounts it posts to (output VAT/GST 2200 or US sales tax payable 2230, input VAT/GST 1500, VAT suspense 2240). Also returns recommendedCountry — the profile that best fits this organization based on its taxRegime/country. Use list_tax_profiles to discover what apply_tax_profile can seed. No amounts are monetary; rates are basis points.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const profiles = listTaxProfiles();
        const recommended = await resolveProfileForOrg(ctx.organizationId);
        return {
          profiles,
          recommendedCountry: recommended?.country ?? null,
        };
      })
  );

  server.tool(
    "apply_tax_profile",
    "Apply a country tax profile to this organization: seeds the profile's tax rate rows (rates in basis points) so the org has a compliant default set for VAT/GST/sales tax. Pass a two-letter ISO country code (e.g. GB, US, AU); when omitted, the profile is resolved from the org's taxRegime/country. Idempotent: rates that already exist (same name, rate, type, kind) are skipped, never duplicated. The org default rate is only set when the org has no default yet (an existing chosen default is never changed). Does not modify the chart of accounts (control accounts are created on demand at posting time). Requires the manage:tax-rates permission. Returns the created rates and the skipped ones with reasons.",
    {
      country: z
        .string()
        .length(2)
        .optional()
        .describe(
          "Two-letter ISO country code of the profile to apply (US, GB, ZA, AU, CA, IE, IN, NL). Omit to auto-resolve from the organization's taxRegime/country."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-rates");

        const profile = params.country
          ? getTaxProfileByCountry(params.country)
          : await resolveProfileForOrg(ctx.organizationId);

        if (!profile) {
          throw new Error(
            params.country
              ? `No tax profile for country "${params.country}"`
              : "Could not determine a tax profile for this organization; pass a country code"
          );
        }

        return applyTaxProfile(ctx.organizationId, profile);
      })
  );

  server.tool(
    "report_1099",
    "Generate the US 1099-NEC/MISC vendor summary for a calendar tax year. Aggregates payments made to each 1099 vendor (contacts flagged is1099Vendor) on a CASH basis — sums actual supplier payments dated within the year, not bill totals. Card payments are EXCLUDED (those are reported on 1099-K by the card/processor). All amounts are returned in integer cents (e.g. $600.00 = 60000). Each vendor row includes the W-9 tax identifier, classification, backup-withholding flag, total paid, payment count, and whether it meets the reporting threshold ($600 = 60000 cents by default). Returns per-vendor summaries plus the count/total of reportable vendors.",
    {
      year: z
        .number()
        .int()
        .min(2000)
        .max(2100)
        .optional()
        .describe(
          "Four-digit calendar tax year (e.g. 2025). Defaults to the prior calendar year."
        ),
      threshold: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          `Reporting threshold in integer cents; vendors at or above this are flagged reportable. Defaults to ${FORM_1099_NEC_THRESHOLD_CENTS} ($600.00).`
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const year = params.year ?? new Date().getFullYear() - 1;
        return build1099Report(
          ctx.organizationId,
          year,
          params.threshold ?? FORM_1099_NEC_THRESHOLD_CENTS
        );
      })
  );
}
