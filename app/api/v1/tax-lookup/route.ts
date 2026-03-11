import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxJurisdiction } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, validationError } from "@/lib/api/response";
import { lookupTaxRate, saveTaxJurisdiction } from "@/lib/tax/lookup";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const country = url.searchParams.get("country");
    const state = url.searchParams.get("state");
    const postalCode = url.searchParams.get("postalCode");

    if (!country) {
      return validationError("country is required");
    }

    const result = await lookupTaxRate(
      ctx.organizationId,
      country,
      state,
      postalCode
    );

    if (!result) {
      return NextResponse.json({ found: false, rate: null });
    }

    return NextResponse.json({ found: true, rate: result });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  country: z.string().min(1),
  state: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  combinedRate: z.number().int().min(0),
  stateRate: z.number().int().min(0).optional(),
  countyRate: z.number().int().min(0).optional(),
  cityRate: z.number().int().min(0).optional(),
  specialRate: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const result = await saveTaxJurisdiction(ctx.organizationId, parsed);

    return NextResponse.json({ jurisdiction: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) return validationError("id is required");

    const existing = await db.query.taxJurisdiction.findFirst({
      where: eq(taxJurisdiction.id, id),
    });

    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(taxJurisdiction).where(eq(taxJurisdiction.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
