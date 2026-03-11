import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeRate } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const rateSchema = z.object({
  baseCurrency: z.string().min(1).max(10),
  targetCurrency: z.string().min(1).max(10),
  rate: z.number().int().positive(),
  date: z.string().min(1),
  source: z.enum(["manual", "api"]).default("manual"),
});

const createSchema = z.object({
  rates: z.array(rateSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const baseCurrency = url.searchParams.get("baseCurrency");
    const targetCurrency = url.searchParams.get("targetCurrency");

    const conditions = [eq(exchangeRate.organizationId, ctx.organizationId)];

    if (startDate) {
      conditions.push(gte(exchangeRate.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(exchangeRate.date, endDate));
    }
    if (baseCurrency) {
      conditions.push(eq(exchangeRate.baseCurrency, baseCurrency));
    }
    if (targetCurrency) {
      conditions.push(eq(exchangeRate.targetCurrency, targetCurrency));
    }

    const where = and(...conditions);

    const rates = await db.query.exchangeRate.findMany({
      where,
      orderBy: desc(exchangeRate.date),
      limit,
      offset,
    });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exchangeRate)
      .where(where);

    return NextResponse.json(paginatedResponse(rates, count, page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const values = parsed.rates.map((r) => ({
      organizationId: ctx.organizationId,
      baseCurrency: r.baseCurrency,
      targetCurrency: r.targetCurrency,
      rate: r.rate,
      date: r.date,
      source: r.source as "manual" | "api",
    }));

    const created = await db
      .insert(exchangeRate)
      .values(values)
      .onConflictDoUpdate({
        target: [
          exchangeRate.organizationId,
          exchangeRate.baseCurrency,
          exchangeRate.targetCurrency,
          exchangeRate.date,
        ],
        set: {
          rate: sql`excluded.rate`,
          source: sql`excluded.source`,
        },
      })
      .returning();

    return NextResponse.json({ exchangeRates: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
