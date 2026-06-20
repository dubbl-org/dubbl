import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxRate, taxComponent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { ensureTaxRatesSeeded } from "@/lib/api/tax-profiles";
import { z } from "zod";

// A single component of a compound tax (e.g. GST + PST). rate is in basis
// points (1000 = 10.00%); accountId optionally directs the component to its own
// chart account.
const componentSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // basis points: 1000 = 10%
  accountId: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // basis points: 1000 = 10%
  type: z.enum(["sales", "purchase", "both"]).default("both"),
  // How the tax behaves for input-tax recovery / posting. Defaults to
  // standard for backward compatibility.
  kind: z
    .enum([
      "standard",
      "blocked",
      "partial_block",
      "exempt",
      "reverse_charge",
      "no_vat",
      "sales_tax_us",
    ])
    .default("standard"),
  // Share of input tax that is recoverable, in basis points (10000 = 100%).
  recoverablePercent: z.number().int().min(0).max(10000).default(10000),
  // Optional sub-components for compound taxes.
  components: z.array(componentSchema).optional(),
  isDefault: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const query = () =>
      db.query.taxRate.findMany({
        where: and(
          eq(taxRate.organizationId, ctx.organizationId),
          notDeleted(taxRate.deletedAt)
        ),
        with: { components: true },
      });

    let rates = await query();

    // Self-heal: an org with no tax rates (never applied a country profile) can
    // only ever pick "No tax". Seed the standard rates for its country the first
    // time the list is read — mirroring how the chart of accounts self-syncs —
    // so a real VAT/GST rate becomes selectable with no extra setup. Best-effort
    // and a no-op for genuinely tax-free orgs (no resolvable profile).
    if (rates.length === 0) {
      try {
        const result = await ensureTaxRatesSeeded(ctx.organizationId);
        if (result && result.created.length > 0) rates = await query();
      } catch {
        // non-fatal: return the empty list (the "No tax" option still works)
      }
    }

    return NextResponse.json({ taxRates: rates });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-rates");

    const body = await request.json();
    const { components, ...parsed } = createSchema.parse(body);

    const created = await db.transaction(async (tx) => {
      // An org can only have one default tax rate. If this one is being made the
      // default, clear the flag on every other rate in the org first.
      if (parsed.isDefault) {
        await tx
          .update(taxRate)
          .set({ isDefault: false })
          .where(
            and(
              eq(taxRate.organizationId, ctx.organizationId),
              eq(taxRate.isDefault, true)
            )
          );
      }

      const [row] = await tx
        .insert(taxRate)
        .values({
          organizationId: ctx.organizationId,
          ...parsed,
        })
        .returning();

      if (components && components.length > 0) {
        await tx.insert(taxComponent).values(
          components.map((c) => ({
            taxRateId: row.id,
            name: c.name,
            rate: c.rate,
            accountId: c.accountId ?? null,
          }))
        );
      }

      return row;
    });

    logAudit({ ctx, action: "create", entityType: "tax_rate", entityId: created.id, request });

    return NextResponse.json({ taxRate: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
