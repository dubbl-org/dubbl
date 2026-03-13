import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  stripeIntegration,
  stripeEntityMap,
  journalEntry,
  journalLine,
  contact,
  bankAccount,
  bankTransaction,
  payment,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { stripe } from "@/lib/stripe";

type Integration = typeof stripeIntegration.$inferSelect;

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

async function isDuplicate(
  organizationId: string,
  stripeEntityType: string,
  stripeEntityId: string
) {
  const existing = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, organizationId),
      eq(stripeEntityMap.stripeEntityType, stripeEntityType),
      eq(stripeEntityMap.stripeEntityId, stripeEntityId)
    ),
  });
  return !!existing;
}

async function insertEntityMap(
  organizationId: string,
  stripeEntityType: string,
  stripeEntityId: string,
  dubblEntityType: string,
  dubblEntityId: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(stripeEntityMap).values({
    organizationId,
    stripeEntityType,
    stripeEntityId,
    dubblEntityType,
    dubblEntityId,
    metadata: metadata ?? null,
  });
}

async function resolveContact(
  integration: Integration,
  customerId: string | null,
  email: string | null,
  name: string | null
): Promise<string | null> {
  if (!customerId && !email) return null;

  // Check entity map for existing customer mapping
  if (customerId) {
    const mapped = await db.query.stripeEntityMap.findFirst({
      where: and(
        eq(stripeEntityMap.organizationId, integration.organizationId),
        eq(stripeEntityMap.stripeEntityType, "customer"),
        eq(stripeEntityMap.stripeEntityId, customerId)
      ),
    });
    if (mapped) return mapped.dubblEntityId;
  }

  // Try to match by email
  if (email) {
    const existing = await db.query.contact.findFirst({
      where: and(
        eq(contact.organizationId, integration.organizationId),
        eq(contact.email, email),
        notDeleted(contact.deletedAt)
      ),
    });
    if (existing) {
      // Create entity map for future lookups
      if (customerId) {
        await insertEntityMap(
          integration.organizationId,
          "customer",
          customerId,
          "contact",
          existing.id
        );
      }
      return existing.id;
    }
  }

  // Create new contact
  const [newContact] = await db
    .insert(contact)
    .values({
      organizationId: integration.organizationId,
      name: name || email || "Stripe Customer",
      email,
      type: "customer",
    })
    .returning();

  if (customerId) {
    await insertEntityMap(
      integration.organizationId,
      "customer",
      customerId,
      "contact",
      newContact.id
    );
  }

  return newContact.id;
}

export async function handleChargeSucceeded(
  integration: Integration,
  charge: Stripe.Charge
) {
  if (await isDuplicate(integration.organizationId, "charge", charge.id)) return;

  if (
    !integration.clearingAccountId ||
    !integration.revenueAccountId ||
    !integration.feesAccountId
  ) {
    throw new Error("Stripe integration accounts not configured");
  }

  // Check if this charge's payment_intent already exists as a dubbl invoice payment
  if (charge.payment_intent) {
    const existingPayment = await db.query.payment.findFirst({
      where: and(
        eq(payment.organizationId, integration.organizationId),
        eq(
          payment.stripePaymentIntentId,
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent.id
        )
      ),
    });

    if (existingPayment) {
      // Already recorded via invoice payment link - only record the fee
      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction as string,
        { stripeAccount: integration.stripeAccountId }
      );
      const fee = balanceTx.fee;

      if (fee > 0) {
        const entryNumber = await getNextEntryNumber(integration.organizationId);
        const [feeEntry] = await db
          .insert(journalEntry)
          .values({
            organizationId: integration.organizationId,
            entryNumber,
            date: new Date(charge.created * 1000).toISOString().slice(0, 10),
            description: `Stripe fee for ${charge.id}`,
            reference: charge.id,
            status: "posted",
            sourceType: "stripe_fee",
            postedAt: new Date(),
            createdBy: integration.connectedBy,
          })
          .returning();

        await db.insert(journalLine).values([
          {
            journalEntryId: feeEntry.id,
            accountId: integration.feesAccountId,
            description: `Stripe processing fee`,
            debitAmount: fee,
            creditAmount: 0,
          },
          {
            journalEntryId: feeEntry.id,
            accountId: integration.clearingAccountId,
            description: `Stripe processing fee`,
            debitAmount: 0,
            creditAmount: fee,
          },
        ]);

        await insertEntityMap(
          integration.organizationId,
          "charge",
          charge.id,
          "journal_entry",
          feeEntry.id,
          { type: "fee_only" }
        );
      }
      return;
    }
  }

  // Resolve contact
  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;
  const contactId = await resolveContact(
    integration,
    customerId,
    charge.billing_details?.email ?? null,
    charge.billing_details?.name ?? null
  );

  const chargeDate = new Date(charge.created * 1000).toISOString().slice(0, 10);
  const currencyCode = charge.currency.toUpperCase();

  // Revenue journal entry: DR Stripe Clearing, CR Revenue
  const entryNumber = await getNextEntryNumber(integration.organizationId);
  const [revenueEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: chargeDate,
      description: `Stripe charge ${charge.id}`,
      reference: charge.id,
      status: "posted",
      sourceType: "stripe_charge",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: revenueEntry.id,
      accountId: integration.clearingAccountId,
      description: `Stripe charge ${charge.id}`,
      debitAmount: charge.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: revenueEntry.id,
      accountId: integration.revenueAccountId,
      description: `Stripe charge ${charge.id}`,
      debitAmount: 0,
      creditAmount: charge.amount,
      currencyCode,
    },
  ]);

  await insertEntityMap(
    integration.organizationId,
    "charge",
    charge.id,
    "journal_entry",
    revenueEntry.id,
    { contactId, amount: charge.amount, currency: currencyCode }
  );

  // Fee journal entry: DR Fees, CR Stripe Clearing
  const balanceTx = await stripe.balanceTransactions.retrieve(
    charge.balance_transaction as string,
    { stripeAccount: integration.stripeAccountId }
  );
  const fee = balanceTx.fee;

  if (fee > 0) {
    const feeEntryNumber = await getNextEntryNumber(integration.organizationId);
    const [feeEntry] = await db
      .insert(journalEntry)
      .values({
        organizationId: integration.organizationId,
        entryNumber: feeEntryNumber,
        date: chargeDate,
        description: `Stripe fee for ${charge.id}`,
        reference: charge.id,
        status: "posted",
        sourceType: "stripe_fee",
        postedAt: new Date(),
        createdBy: integration.connectedBy,
      })
      .returning();

    await db.insert(journalLine).values([
      {
        journalEntryId: feeEntry.id,
        accountId: integration.feesAccountId,
        description: `Stripe processing fee`,
        debitAmount: fee,
        creditAmount: 0,
      },
      {
        journalEntryId: feeEntry.id,
        accountId: integration.clearingAccountId,
        description: `Stripe processing fee`,
        debitAmount: 0,
        creditAmount: fee,
      },
    ]);
  }
}

export async function handleChargeRefunded(
  integration: Integration,
  charge: Stripe.Charge
) {
  if (
    !integration.clearingAccountId ||
    !integration.revenueAccountId ||
    !integration.feesAccountId
  ) {
    throw new Error("Stripe integration accounts not configured");
  }

  const refunds = charge.refunds?.data ?? [];

  for (const refund of refunds) {
    if (await isDuplicate(integration.organizationId, "refund", refund.id)) continue;

    const refundDate = new Date(refund.created * 1000).toISOString().slice(0, 10);
    const currencyCode = refund.currency.toUpperCase();
    const entryNumber = await getNextEntryNumber(integration.organizationId);

    // Reverse revenue: DR Revenue, CR Stripe Clearing
    const [refundEntry] = await db
      .insert(journalEntry)
      .values({
        organizationId: integration.organizationId,
        entryNumber,
        date: refundDate,
        description: `Stripe refund ${refund.id}`,
        reference: refund.id,
        status: "posted",
        sourceType: "stripe_refund",
        postedAt: new Date(),
        createdBy: integration.connectedBy,
      })
      .returning();

    await db.insert(journalLine).values([
      {
        journalEntryId: refundEntry.id,
        accountId: integration.revenueAccountId,
        description: `Stripe refund ${refund.id}`,
        debitAmount: refund.amount,
        creditAmount: 0,
        currencyCode,
      },
      {
        journalEntryId: refundEntry.id,
        accountId: integration.clearingAccountId,
        description: `Stripe refund ${refund.id}`,
        debitAmount: 0,
        creditAmount: refund.amount,
        currencyCode,
      },
    ]);

    await insertEntityMap(
      integration.organizationId,
      "refund",
      refund.id,
      "journal_entry",
      refundEntry.id,
      { chargeId: charge.id, amount: refund.amount, currency: currencyCode }
    );

    // Reverse fee if applicable
    if (refund.balance_transaction) {
      const balanceTx = await stripe.balanceTransactions.retrieve(
        typeof refund.balance_transaction === "string"
          ? refund.balance_transaction
          : refund.balance_transaction.id,
        { stripeAccount: integration.stripeAccountId }
      );

      // Fee refund is negative fee on the balance transaction
      const feeRefund = Math.abs(balanceTx.fee);
      if (feeRefund > 0) {
        const feeEntryNumber = await getNextEntryNumber(integration.organizationId);
        const [feeRefundEntry] = await db
          .insert(journalEntry)
          .values({
            organizationId: integration.organizationId,
            entryNumber: feeEntryNumber,
            date: refundDate,
            description: `Stripe fee refund for ${refund.id}`,
            reference: refund.id,
            status: "posted",
            sourceType: "stripe_fee_refund",
            postedAt: new Date(),
            createdBy: integration.connectedBy,
          })
          .returning();

        await db.insert(journalLine).values([
          {
            journalEntryId: feeRefundEntry.id,
            accountId: integration.clearingAccountId,
            description: `Stripe fee refund`,
            debitAmount: feeRefund,
            creditAmount: 0,
          },
          {
            journalEntryId: feeRefundEntry.id,
            accountId: integration.feesAccountId,
            description: `Stripe fee refund`,
            debitAmount: 0,
            creditAmount: feeRefund,
          },
        ]);
      }
    }
  }
}

export async function handlePayoutPaid(
  integration: Integration,
  payout: Stripe.Payout
) {
  if (await isDuplicate(integration.organizationId, "payout", payout.id)) return;

  if (!integration.clearingAccountId || !integration.payoutBankAccountId) {
    throw new Error("Stripe integration accounts not configured for payouts");
  }

  // Look up the bank account to get its chart account
  const bankAcct = await db.query.bankAccount.findFirst({
    where: eq(bankAccount.id, integration.payoutBankAccountId),
  });

  const payoutDate = new Date(payout.arrival_date * 1000).toISOString().slice(0, 10);
  const currencyCode = payout.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // DR Bank, CR Stripe Clearing
  const [payoutEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: payoutDate,
      description: `Stripe payout ${payout.id}`,
      reference: payout.id,
      status: "posted",
      sourceType: "stripe_payout",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  // Use the bank account's linked chart account if available
  const bankChartAccountId = bankAcct?.chartAccountId ?? integration.clearingAccountId;

  await db.insert(journalLine).values([
    {
      journalEntryId: payoutEntry.id,
      accountId: bankChartAccountId,
      description: `Stripe payout ${payout.id}`,
      debitAmount: payout.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: payoutEntry.id,
      accountId: integration.clearingAccountId,
      description: `Stripe payout ${payout.id}`,
      debitAmount: 0,
      creditAmount: payout.amount,
      currencyCode,
    },
  ]);

  // Create bank transaction
  await db.insert(bankTransaction).values({
    bankAccountId: integration.payoutBankAccountId,
    date: payoutDate,
    description: `Stripe payout ${payout.id}`,
    amount: payout.amount,
    sourceType: "stripe",
    externalTransactionId: payout.id,
    currencyCode,
    journalEntryId: payoutEntry.id,
  });

  await insertEntityMap(
    integration.organizationId,
    "payout",
    payout.id,
    "journal_entry",
    payoutEntry.id,
    { amount: payout.amount, currency: currencyCode }
  );
}

export async function handleCustomerCreated(
  integration: Integration,
  customer: Stripe.Customer
) {
  if (await isDuplicate(integration.organizationId, "customer", customer.id)) return;

  // Try to find existing contact by email
  if (customer.email) {
    const existing = await db.query.contact.findFirst({
      where: and(
        eq(contact.organizationId, integration.organizationId),
        eq(contact.email, customer.email),
        notDeleted(contact.deletedAt)
      ),
    });
    if (existing) {
      await insertEntityMap(
        integration.organizationId,
        "customer",
        customer.id,
        "contact",
        existing.id
      );
      return;
    }
  }

  // Create new contact
  const address = customer.address;
  const [newContact] = await db
    .insert(contact)
    .values({
      organizationId: integration.organizationId,
      name: customer.name || customer.email || "Stripe Customer",
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      type: "customer",
      addresses: address
        ? {
            billing: {
              line1: address.line1 ?? undefined,
              line2: address.line2 ?? undefined,
              city: address.city ?? undefined,
              state: address.state ?? undefined,
              postalCode: address.postal_code ?? undefined,
              country: address.country ?? undefined,
            },
          }
        : undefined,
    })
    .returning();

  await insertEntityMap(
    integration.organizationId,
    "customer",
    customer.id,
    "contact",
    newContact.id
  );
}

export async function handleCustomerUpdated(
  integration: Integration,
  customer: Stripe.Customer
) {
  // Look up existing mapping
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "customer"),
      eq(stripeEntityMap.stripeEntityId, customer.id)
    ),
  });

  if (mapped) {
    // Update existing contact
    const address = customer.address;
    await db
      .update(contact)
      .set({
        name: customer.name || undefined,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
        addresses: address
          ? {
              billing: {
                line1: address.line1 ?? undefined,
                line2: address.line2 ?? undefined,
                city: address.city ?? undefined,
                state: address.state ?? undefined,
                postalCode: address.postal_code ?? undefined,
                country: address.country ?? undefined,
              },
            }
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(contact.id, mapped.dubblEntityId));
  } else {
    // Create if not found
    await handleCustomerCreated(integration, customer);
  }
}
