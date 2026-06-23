import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { currency, exchangeRate } from "@/lib/db/schema";
import { and, eq, gte, lte, desc, ilike, or, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { ensureCurrencies } from "@/lib/currency/ensure-currencies";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { getExchangeRate, convertAmount } from "@/lib/currency/converter";
import type { AuthContext } from "@/lib/api/auth-context";

const RATE_SCALE = 1_000_000; // exchangeRate.rate is an integer with 6 decimals

export function registerCurrencyTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_currencies",
    "List the available ISO 4217 currencies (code, name, symbol, and decimal places / minor units). Use the `code` value when setting a currency on any record.",
    {
      search: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on currency code or name"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await ensureCurrencies();
        const where = params.search
          ? or(
              ilike(currency.code, `%${params.search}%`),
              ilike(currency.name, `%${params.search}%`)
            )
          : undefined;
        const currencies = await db.query.currency.findMany({
          where,
          orderBy: currency.code,
        });
        return { currencies };
      })
  );

  server.tool(
    "list_exchange_rates",
    "List stored exchange rates for the organization. Rates are quoted as target units per 1 base unit. `rateDecimal` is the human-readable value; `rate` is the stored integer (6 decimal places, 1000000 = 1.0).",
    {
      baseCurrency: currencyCodeSchema.optional().describe("Filter by base currency code"),
      targetCurrency: currencyCodeSchema.optional().describe("Filter by target currency code"),
      startDate: z.string().optional().describe("Earliest rate date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Latest rate date (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows (max 200)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(exchangeRate.organizationId, ctx.organizationId)];
        if (params.baseCurrency) conditions.push(eq(exchangeRate.baseCurrency, params.baseCurrency));
        if (params.targetCurrency) conditions.push(eq(exchangeRate.targetCurrency, params.targetCurrency));
        if (params.startDate) conditions.push(gte(exchangeRate.date, params.startDate));
        if (params.endDate) conditions.push(lte(exchangeRate.date, params.endDate));

        const rates = await db.query.exchangeRate.findMany({
          where: and(...conditions),
          orderBy: desc(exchangeRate.date),
          limit: params.limit,
        });
        return {
          rates: rates.map((r) => ({ ...r, rateDecimal: r.rate / RATE_SCALE })),
        };
      })
  );

  server.tool(
    "get_exchange_rate",
    "Get the effective exchange rate for a currency pair on or before a date, using the organization's stored rates (with inverse-pair fallback). Returns null if no rate is available. `rate` is the integer (6 decimals); `rateDecimal` is human-readable.",
    {
      baseCurrency: currencyCodeSchema.describe("Base currency code (the 'from' currency)"),
      targetCurrency: currencyCodeSchema.describe("Target currency code (the 'to' currency)"),
      date: z.string().describe("As-of date (YYYY-MM-DD); the latest rate on or before this date is used"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const rate = await getExchangeRate(
          ctx.organizationId,
          params.baseCurrency,
          params.targetCurrency,
          params.date
        );
        return {
          baseCurrency: params.baseCurrency,
          targetCurrency: params.targetCurrency,
          date: params.date,
          rate,
          rateDecimal: rate === null ? null : rate / RATE_SCALE,
        };
      })
  );

  server.tool(
    "convert_amount",
    "Convert a monetary amount (in integer minor units, e.g. cents) from one currency to another using the organization's effective rate on a date. Returns the converted amount in integer minor units.",
    {
      amountMinorUnits: z
        .number()
        .int()
        .describe("Amount to convert, in integer minor units (e.g. $12.50 = 1250)"),
      fromCurrency: currencyCodeSchema.describe("Source currency code"),
      toCurrency: currencyCodeSchema.describe("Destination currency code"),
      date: z.string().describe("As-of date (YYYY-MM-DD) for the rate"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const rate = await getExchangeRate(
          ctx.organizationId,
          params.fromCurrency,
          params.toCurrency,
          params.date
        );
        if (rate === null) {
          throw new Error(
            `No exchange rate available for ${params.fromCurrency}->${params.toCurrency} on or before ${params.date}`
          );
        }
        return {
          fromCurrency: params.fromCurrency,
          toCurrency: params.toCurrency,
          date: params.date,
          rate,
          rateDecimal: rate / RATE_SCALE,
          amountMinorUnits: params.amountMinorUnits,
          convertedMinorUnits: convertAmount(params.amountMinorUnits, rate),
        };
      })
  );

  server.tool(
    "set_exchange_rate",
    "Create or update a manual exchange rate for the organization (requires the manage:tax-config role). Provide the rate as a decimal (target units per 1 base unit). Manual rates take precedence over auto-fetched ones for the same day.",
    {
      baseCurrency: currencyCodeSchema.describe("Base currency code (the 'from' currency)"),
      targetCurrency: currencyCodeSchema.describe("Target currency code (the 'to' currency)"),
      rateDecimal: z
        .number()
        .positive()
        .describe("Rate as a decimal, e.g. 1.08 means 1.08 target per 1 base"),
      date: z.string().describe("Effective date (YYYY-MM-DD)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");
        const rate = Math.round(params.rateDecimal * RATE_SCALE);
        const [saved] = await db
          .insert(exchangeRate)
          .values({
            organizationId: ctx.organizationId,
            baseCurrency: params.baseCurrency,
            targetCurrency: params.targetCurrency,
            rate,
            date: params.date,
            source: "manual",
          })
          .onConflictDoUpdate({
            target: [
              exchangeRate.organizationId,
              exchangeRate.baseCurrency,
              exchangeRate.targetCurrency,
              exchangeRate.date,
            ],
            set: { rate: sql`excluded.rate`, source: sql`excluded.source` },
          })
          .returning();
        return { exchangeRate: { ...saved, rateDecimal: saved.rate / RATE_SCALE } };
      })
  );

  server.tool(
    "delete_exchange_rate",
    "Delete a stored exchange rate by its id (requires the manage:tax-config role). Only deletes rates belonging to the organization. Returns { success: true } on success; errors if no matching rate exists.",
    {
      id: z.string().describe("The exchange rate's id (UUID) to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");
        const existing = await db.query.exchangeRate.findFirst({
          where: and(
            eq(exchangeRate.id, params.id),
            eq(exchangeRate.organizationId, ctx.organizationId)
          ),
        });
        if (!existing) {
          throw new Error(`Exchange rate not found: ${params.id}`);
        }
        await db.delete(exchangeRate).where(eq(exchangeRate.id, params.id));
        return { success: true };
      })
  );
}
