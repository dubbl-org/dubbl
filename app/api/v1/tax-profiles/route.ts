import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  listTaxProfiles,
  getTaxProfileByCountry,
  resolveProfileForOrg,
  applyTaxProfile,
} from "@/lib/api/tax-profiles";
import { z } from "zod";

/**
 * GET /api/v1/tax-profiles
 *   ?country=GB  → returns that single country's profile
 *   (no param)   → returns the full catalogue plus the profile that best fits
 *                  the org (resolved from ?country, else org.taxRegime/country).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const country = url.searchParams.get("country");

    if (country) {
      const profile = getTaxProfileByCountry(country);
      if (!profile) {
        return NextResponse.json(
          { error: `No tax profile for country "${country}"` },
          { status: 404 }
        );
      }
      return NextResponse.json({ profile });
    }

    const profiles = listTaxProfiles();
    const recommended = await resolveProfileForOrg(ctx.organizationId);
    return NextResponse.json({
      profiles,
      recommendedCountry: recommended?.country ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}

const applySchema = z.object({
  // Two-letter ISO country code identifying the profile to apply. Optional: when
  // omitted, the profile is resolved from the org's taxRegime / country.
  country: z.string().min(2).max(2).optional(),
});

/**
 * POST /api/v1/tax-profiles
 * Apply a country profile to the org — seeds the profile's taxRate rows.
 * Existing matching rates are skipped (no duplicates). Returns created + skipped.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-rates");

    const body = await request.json().catch(() => ({}));
    const parsed = applySchema.parse(body);

    const profile = parsed.country
      ? getTaxProfileByCountry(parsed.country)
      : await resolveProfileForOrg(ctx.organizationId);

    if (!profile) {
      return validationError(
        parsed.country
          ? `No tax profile for country "${parsed.country}"`
          : "Could not determine a tax profile for this organization; pass a country code"
      );
    }

    const result = await applyTaxProfile(ctx.organizationId, profile);

    logAudit({
      ctx,
      action: "apply_tax_profile",
      entityType: "tax_profile",
      entityId: profile.country,
      changes: { created: result.created.length, skipped: result.skipped.length },
      request,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
