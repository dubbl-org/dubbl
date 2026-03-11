import { db } from "@/lib/db";
import { taxJurisdiction } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface TaxLookupResult {
  combinedRate: number; // basis points
  stateRate: number;
  countyRate: number;
  cityRate: number;
  specialRate: number;
  source: "cached" | "manual";
  country: string;
  state: string | null;
  postalCode: string | null;
}

/**
 * Look up tax rate by address. Checks cached jurisdictions first.
 * For external API support (TaxJar, Avalara), extend with provider adapters.
 */
export async function lookupTaxRate(
  organizationId: string,
  country: string,
  state?: string | null,
  postalCode?: string | null,
): Promise<TaxLookupResult | null> {
  // Check local cache first
  const conditions = [
    eq(taxJurisdiction.organizationId, organizationId),
    eq(taxJurisdiction.country, country),
  ];

  if (state) {
    conditions.push(eq(taxJurisdiction.state, state));
  }
  if (postalCode) {
    conditions.push(eq(taxJurisdiction.postalCode, postalCode));
  }

  const cached = await db.query.taxJurisdiction.findFirst({
    where: and(...conditions),
  });

  if (cached) {
    return {
      combinedRate: cached.combinedRate,
      stateRate: cached.stateRate,
      countyRate: cached.countyRate,
      cityRate: cached.cityRate,
      specialRate: cached.specialRate,
      source: "cached",
      country: cached.country,
      state: cached.state,
      postalCode: cached.postalCode,
    };
  }

  return null;
}

/**
 * Save or update a tax jurisdiction in the cache.
 */
export async function saveTaxJurisdiction(
  organizationId: string,
  data: {
    country: string;
    state?: string | null;
    county?: string | null;
    city?: string | null;
    postalCode?: string | null;
    combinedRate: number;
    stateRate?: number;
    countyRate?: number;
    cityRate?: number;
    specialRate?: number;
    source?: "manual" | "api";
  }
) {
  const [result] = await db
    .insert(taxJurisdiction)
    .values({
      organizationId,
      country: data.country,
      state: data.state || null,
      county: data.county || null,
      city: data.city || null,
      postalCode: data.postalCode || null,
      combinedRate: data.combinedRate,
      stateRate: data.stateRate || 0,
      countyRate: data.countyRate || 0,
      cityRate: data.cityRate || 0,
      specialRate: data.specialRate || 0,
      source: data.source || "manual",
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [taxJurisdiction.organizationId, taxJurisdiction.country, taxJurisdiction.state, taxJurisdiction.postalCode],
      set: {
        combinedRate: data.combinedRate,
        stateRate: data.stateRate || 0,
        countyRate: data.countyRate || 0,
        cityRate: data.cityRate || 0,
        specialRate: data.specialRate || 0,
        county: data.county || null,
        city: data.city || null,
        source: data.source || "manual",
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return result;
}
