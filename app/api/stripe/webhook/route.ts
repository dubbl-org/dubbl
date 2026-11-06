import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscription, invoice, payment, paymentAllocation, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { isPaidPlan, planFromPriceId } from "@/lib/stripe-prices";
import { notifyPaymentReceived, notifySafely } from "@/lib/notifications/events";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { emitPaymentReceived } from "@/lib/webhooks/events";

function mapStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "incomplete":
      return status;
    case "unpaid":
      return "past_due" as const;
    default:
      return "canceled" as const;
  }
}

function getItemPeriod(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    start: item ? new Date(item.current_period_start * 1000) : new Date(),
    end: item ? new Date(item.current_period_end * 1000) : new Date(),
  };
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;

      if (orgId && session.subscription) {
        // Plan checkout
        const metaPlan = session.metadata?.plan ?? "";
        if (isPaidPlan(metaPlan)) {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const existing = await db.query.subscription.findFirst({
            where: eq(subscription.organizationId, orgId),
          });

          const period = getItemPeriod(stripeSubscription);

          const priceId = stripeSubscription.items.data[0].price.id;
          // The price is the source of truth; metadata covers unknown prices
          const fromPrice = planFromPriceId(priceId);
          const plan = fromPrice?.plan ?? metaPlan;
          const billingInterval = fromPrice?.interval ?? (session.metadata?.interval === "annual" ? "annual" : "monthly");

          const data = {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            stripePriceId: priceId,
            plan,
            status: mapStatus(stripeSubscription.status),
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            seatCount: stripeSubscription.items.data[0].quantity || 1,
            billingInterval,
            updatedAt: new Date(),
          };

          if (existing) {
            await db
              .update(subscription)
              .set(data)
              .where(eq(subscription.id, existing.id));
          } else {
            await db.insert(subscription).values({
              organizationId: orgId,
              ...data,
            });
          }
        }
      }

      // Handle invoice payments
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId && !session.metadata?.plan) {
        const inv = await db.query.invoice.findFirst({
          where: eq(invoice.id, invoiceId),
        });

        if (inv && inv.status !== "paid") {
          // Idempotency: skip if a payment already exists for this PI
          const piId = (session.payment_intent as string) || null;
          if (piId) {
            const existingPayment = await db.query.payment.findFirst({
              where: and(
                eq(payment.organizationId, inv.organizationId),
                eq(payment.stripePaymentIntentId, piId)
              ),
            });
            if (existingPayment) break;
          }

          // What the customer actually paid (checkout charges the amount due
          // at the time the session was created, with no tax added on top)
          const paidAmount = session.amount_total ?? inv.amountDue;
          const allocated = Math.min(paidAmount, inv.amountDue);
          const newAmountPaid = inv.amountPaid + allocated;
          const newAmountDue = Math.max(0, inv.total - newAmountPaid);
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          const paidDate = new Date().toISOString().slice(0, 10);

          // The journal entry needs a user: whoever created the invoice, else an owner
          const actorId =
            inv.createdBy ??
            (
              await db.query.member.findFirst({
                where: and(eq(member.organizationId, inv.organizationId), eq(member.role, "owner")),
                columns: { userId: true },
              })
            )?.userId;
          if (!actorId) break;
          const jeCtx = { organizationId: inv.organizationId, userId: actorId };

          // A locked period can't take the payment yet: answer 500 so Stripe
          // retries, and the payment lands once the lock is moved.
          await assertNotLocked(inv.organizationId, paidDate);

          const paymentNumber = await getNextNumber(inv.organizationId, "payment", "payment_number", "PAY");

          // Payment, allocation, journal entry (DR Bank / CR Accounts
          // Receivable) and the invoice balance commit together
          const newPayment = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(payment)
              .values({
                organizationId: inv.organizationId,
                contactId: inv.contactId,
                paymentNumber,
                type: "received",
                date: paidDate,
                amount: paidAmount,
                method: "card",
                reference: `Stripe: ${session.payment_intent || session.id}`,
                currencyCode: inv.currencyCode,
                stripePaymentIntentId: piId,
                createdBy: actorId,
              })
              .returning();

            await tx.insert(paymentAllocation).values({
              paymentId: created.id,
              documentType: "invoice",
              documentId: inv.id,
              amount: allocated,
            });

            const entry = await createPaymentJournalEntry(
              jeCtx,
              {
                type: "invoice",
                reference: paymentNumber,
                amount: paidAmount,
                date: paidDate,
                allocations: [
                  { amount: allocated, currencyCode: inv.currencyCode, issueDate: inv.issueDate },
                ],
              },
              tx
            );
            if (entry) {
              await tx
                .update(payment)
                .set({ journalEntryId: entry.id })
                .where(eq(payment.id, created.id));
            }

            await tx
              .update(invoice)
              .set({
                amountPaid: newAmountPaid,
                amountDue: newAmountDue,
                status: newStatus,
                paidAt: newStatus === "paid" ? new Date() : null,
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, inv.id));

            return created;
          });
          emitPaymentReceived(inv.organizationId, [newPayment.id]);

          await notifySafely(notifyPaymentReceived(inv.organizationId, newPayment.id));
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const period = getItemPeriod(sub);

      // Plan subscription update: the price may have changed through the
      // customer portal, so the plan and interval follow it
      const priceId = sub.items.data[0]?.price.id;
      const fromPrice = planFromPriceId(priceId);
      const status = mapStatus(sub.status);
      await db
        .update(subscription)
        .set({
          status,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          seatCount: sub.items.data[0]?.quantity || 1,
          ...(priceId ? { stripePriceId: priceId } : {}),
          ...(fromPrice ? { plan: fromPrice.plan, billingInterval: fromPrice.interval } : {}),
          ...(status === "canceled" ? { plan: "free" as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, sub.id));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      await db
        .update(subscription)
        .set({
          status: "canceled",
          plan: "free",
          updatedAt: new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, sub.id));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
