import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration, stripeEntityMap } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  parseStripePaymentsCsv,
  parseStripePayoutsCsv,
} from "@/lib/integrations/stripe/csv-parser";
import {
  handleChargeSucceeded,
  handlePayoutPaid,
} from "@/lib/integrations/stripe/sync";
import type Stripe from "stripe";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const integrationId = formData.get("integrationId") as string | null;

    if (!integrationId) {
      return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
    }

    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.id, integrationId),
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) return notFound("Stripe integration");

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!type || !["payments", "payouts"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'payments' or 'payouts'" },
        { status: 400 }
      );
    }

    const text = await file.text();
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (type === "payments") {
      const rows = parseStripePaymentsCsv(text);

      for (const row of rows) {
        // Check for duplicate
        const existing = await db.query.stripeEntityMap.findFirst({
          where: and(
            eq(stripeEntityMap.organizationId, ctx.organizationId),
            eq(stripeEntityMap.stripeEntityType, "charge"),
            eq(stripeEntityMap.stripeEntityId, row.id)
          ),
        });

        if (existing) {
          skipped++;
          continue;
        }

        try {
          // Build a minimal Stripe.Charge-like object
          const charge = {
            id: row.id,
            amount: row.amount,
            currency: row.currency.toLowerCase(),
            created: row.createdUtc
              ? Math.floor(new Date(row.createdUtc).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
            balance_transaction: null,
            payment_intent: null,
            customer: null,
            billing_details: {
              email: row.customerEmail,
              name: row.customerName,
              address: null,
              phone: null,
            },
            refunds: { data: [] },
          } as unknown as Stripe.Charge;

          await handleChargeSucceeded(integration, charge);
          imported++;
        } catch (err) {
          errors.push(`${row.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    } else {
      const rows = parseStripePayoutsCsv(text);

      for (const row of rows) {
        const existing = await db.query.stripeEntityMap.findFirst({
          where: and(
            eq(stripeEntityMap.organizationId, ctx.organizationId),
            eq(stripeEntityMap.stripeEntityType, "payout"),
            eq(stripeEntityMap.stripeEntityId, row.id)
          ),
        });

        if (existing) {
          skipped++;
          continue;
        }

        try {
          const payout = {
            id: row.id,
            amount: row.amount,
            currency: row.currency.toLowerCase(),
            arrival_date: row.arrivalDate
              ? Math.floor(new Date(row.arrivalDate).getTime() / 1000)
              : Math.floor(Date.now() / 1000),
          } as unknown as Stripe.Payout;

          await handlePayoutPaid(integration, payout);
          imported++;
        } catch (err) {
          errors.push(`${row.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (err) {
    return handleError(err);
  }
}
