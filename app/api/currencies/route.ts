import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currency } from "@/lib/db/schema";
import { ensureCurrencies } from "@/lib/currency/ensure-currencies";
import { isValidCurrencyCode } from "@/lib/currency/iso4217";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";

export async function GET() {
  // Self-heal the reference table so the list is never empty / stale.
  try {
    await ensureCurrencies();
  } catch (err) {
    console.error("ensureCurrencies failed; serving existing rows", err);
  }

  const currencies = await db.query.currency.findMany({
    orderBy: currency.code,
  });
  return NextResponse.json({ currencies });
}

export async function POST(req: NextRequest) {
  try {
    // Adding a global currency is an admin action — require auth + role.
    const ctx = await getAuthContext(req);
    requireRole(ctx, "manage:tax-config");

    const body = await req.json();
    const { code, name, symbol, decimalPlaces } = body ?? {};

    if (!code || !name || !symbol) {
      return NextResponse.json(
        { error: "code, name, and symbol are required" },
        { status: 400 }
      );
    }

    const normalized = String(code).toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      return NextResponse.json(
        { error: "code must be a 3-letter currency code" },
        { status: 400 }
      );
    }
    if (!isValidCurrencyCode(normalized)) {
      return NextResponse.json(
        { error: `${normalized} is not a recognized ISO 4217 currency code` },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(currency)
      .values({
        code: normalized,
        name,
        symbol,
        decimalPlaces: typeof decimalPlaces === "number" ? decimalPlaces : 2,
      })
      .onConflictDoNothing({ target: currency.code })
      .returning();

    if (!created) {
      // Already exists — return the existing row rather than erroring.
      const existing = await db.query.currency.findFirst({
        where: eq(currency.code, normalized),
      });
      return NextResponse.json({ currency: existing }, { status: 200 });
    }

    return NextResponse.json({ currency: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
