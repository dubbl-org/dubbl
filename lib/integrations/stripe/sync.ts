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
  paymentAllocation,
  invoice,
  chartAccount,
  creditNote,
  creditNoteLine,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { stripe } from "@/lib/stripe";
import { getNextNumber } from "@/lib/api/numbering";
import { sendNotification } from "@/lib/notifications/send";

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

/**
 * Resolve or create a chart account by name and type for the organization.
 */
async function resolveOrCreateAccount(
  organizationId: string,
  name: string,
  type: "asset" | "liability" | "equity" | "revenue" | "expense",
  subType: string,
  code: string
): Promise<string> {
  const existing = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, code),
      notDeleted(chartAccount.deletedAt)
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(chartAccount)
    .values({
      organizationId,
      code,
      name,
      type,
      subType,
    })
    .returning();
  return created.id;
}

// ──────────────────────────────────────────────────
// Event handlers
// ──────────────────────────────────────────────────

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
    const piId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent.id;

    const existingPayment = await db.query.payment.findFirst({
      where: and(
        eq(payment.organizationId, integration.organizationId),
        eq(payment.stripePaymentIntentId, piId)
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

    // Reverse fee if applicable (with its own dedup to handle partial failures)
    if (refund.balance_transaction) {
      const feeRefundKey = `refund_fee_${refund.id}`;
      if (!await isDuplicate(integration.organizationId, feeRefundKey, refund.id)) {
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

          await insertEntityMap(
            integration.organizationId,
            feeRefundKey,
            refund.id,
            "journal_entry",
            feeRefundEntry.id,
            { feeRefund }
          );
        }
      }
    }

    // Update invoice status if refund is linked to a payment
    const piId = typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

    if (piId) {
      const existingPayment = await db.query.payment.findFirst({
        where: and(
          eq(payment.organizationId, integration.organizationId),
          eq(payment.stripePaymentIntentId, piId)
        ),
      });

      if (existingPayment) {
        // Find invoice allocation for this payment
        const allocations = await db.query.paymentAllocation.findMany({
          where: eq(paymentAllocation.paymentId, existingPayment.id),
        });

        for (const alloc of allocations) {
          if (alloc.documentType !== "invoice") continue;

          const inv = await db.query.invoice.findFirst({
            where: eq(invoice.id, alloc.documentId),
          });
          if (!inv) continue;

          const newAmountPaid = Math.max(0, inv.amountPaid - refund.amount);
          const newAmountDue = inv.total - newAmountPaid;
          let newStatus: "sent" | "partial" | "paid" = "sent";
          if (newAmountPaid > 0 && newAmountPaid < inv.total) {
            newStatus = "partial";
          } else if (newAmountPaid >= inv.total) {
            newStatus = "paid";
          }

          await db
            .update(invoice)
            .set({
              amountPaid: newAmountPaid,
              amountDue: newAmountDue,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, inv.id));
        }
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

  // Create bank transaction (auto-reconciled since we create journal entry + bank tx together)
  await db.insert(bankTransaction).values({
    bankAccountId: integration.payoutBankAccountId,
    date: payoutDate,
    description: `Stripe payout ${payout.id}`,
    amount: payout.amount,
    status: "reconciled",
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

export async function handlePayoutFailed(
  integration: Integration,
  payout: Stripe.Payout
) {
  // Update integration status to error
  await db
    .update(stripeIntegration)
    .set({
      status: "error",
      lastError: payout.failure_message ?? "Payout failed",
      updatedAt: new Date(),
    })
    .where(eq(stripeIntegration.id, integration.id));
}

export async function handlePayoutCanceled(
  integration: Integration,
  payout: Stripe.Payout
) {
  if (await isDuplicate(integration.organizationId, "payout_canceled", payout.id)) return;

  // Look up the original payout entity map
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "payout"),
      eq(stripeEntityMap.stripeEntityId, payout.id)
    ),
  });

  if (!mapped) return;

  // Void the linked journal entry
  await db
    .update(journalEntry)
    .set({
      status: "void",
      voidReason: "Stripe payout canceled",
      updatedAt: new Date(),
    })
    .where(eq(journalEntry.id, mapped.dubblEntityId));

  // Exclude the bank transaction (it didn't happen)
  await db
    .update(bankTransaction)
    .set({
      status: "excluded",
    })
    .where(eq(bankTransaction.journalEntryId, mapped.dubblEntityId));

  await insertEntityMap(
    integration.organizationId,
    "payout_canceled",
    payout.id,
    "journal_entry",
    mapped.dubblEntityId,
    { voidedAt: new Date().toISOString() }
  );
}

export async function handlePayoutReversed(
  integration: Integration,
  payout: Stripe.Payout
) {
  if (await isDuplicate(integration.organizationId, "payout_reversed", payout.id)) return;

  // Look up the original payout entity map
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "payout"),
      eq(stripeEntityMap.stripeEntityId, payout.id)
    ),
  });

  if (!mapped) return;

  if (!integration.clearingAccountId || !integration.payoutBankAccountId) return;

  // Look up bank account chart account
  const bankAcct = await db.query.bankAccount.findFirst({
    where: eq(bankAccount.id, integration.payoutBankAccountId),
  });
  const bankChartAccountId = bankAcct?.chartAccountId ?? integration.clearingAccountId;

  const reversalDate = new Date().toISOString().slice(0, 10);
  const currencyCode = payout.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // Reverse the payout: DR Stripe Clearing, CR Bank
  const [reversalEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: reversalDate,
      description: `Stripe payout reversal ${payout.id}`,
      reference: payout.id,
      status: "posted",
      sourceType: "stripe_payout_reversal",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: reversalEntry.id,
      accountId: integration.clearingAccountId,
      description: `Stripe payout reversal ${payout.id}`,
      debitAmount: payout.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: reversalEntry.id,
      accountId: bankChartAccountId,
      description: `Stripe payout reversal ${payout.id}`,
      debitAmount: 0,
      creditAmount: payout.amount,
      currencyCode,
    },
  ]);

  // Create a negative bank transaction for the reversal
  await db.insert(bankTransaction).values({
    bankAccountId: integration.payoutBankAccountId,
    date: reversalDate,
    description: `Stripe payout reversal ${payout.id}`,
    amount: -payout.amount,
    status: "reconciled",
    sourceType: "stripe",
    externalTransactionId: `${payout.id}_reversal`,
    currencyCode,
    journalEntryId: reversalEntry.id,
  });

  await insertEntityMap(
    integration.organizationId,
    "payout_reversed",
    payout.id,
    "journal_entry",
    reversalEntry.id,
    { amount: payout.amount, currency: currencyCode }
  );
}

export async function handleDisputeCreated(
  integration: Integration,
  dispute: Stripe.Dispute
) {
  if (await isDuplicate(integration.organizationId, "dispute", dispute.id)) return;

  if (!integration.revenueAccountId) {
    throw new Error("Stripe integration accounts not configured");
  }

  // Resolve or create a Stripe Disputes liability account
  const disputeAccountId = await resolveOrCreateAccount(
    integration.organizationId,
    "Stripe Disputes",
    "liability",
    "current_liability",
    "STRIPE-DISPUTES"
  );

  const disputeDate = new Date(dispute.created * 1000).toISOString().slice(0, 10);
  const currencyCode = dispute.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // DR Revenue, CR Dispute Liability
  const [disputeEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: disputeDate,
      description: `Stripe dispute ${dispute.id}`,
      reference: dispute.id,
      status: "posted",
      sourceType: "stripe_dispute",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: disputeEntry.id,
      accountId: integration.revenueAccountId,
      description: `Stripe dispute ${dispute.id}`,
      debitAmount: dispute.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: disputeEntry.id,
      accountId: disputeAccountId,
      description: `Stripe dispute ${dispute.id}`,
      debitAmount: 0,
      creditAmount: dispute.amount,
      currencyCode,
    },
  ]);

  await insertEntityMap(
    integration.organizationId,
    "dispute",
    dispute.id,
    "journal_entry",
    disputeEntry.id,
    { chargeId: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id, amount: dispute.amount, currency: currencyCode }
  );

  // If the charge was linked to a payment, update invoice amountPaid/amountDue
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (chargeId) {
    const chargeMap = await db.query.stripeEntityMap.findFirst({
      where: and(
        eq(stripeEntityMap.organizationId, integration.organizationId),
        eq(stripeEntityMap.stripeEntityType, "charge"),
        eq(stripeEntityMap.stripeEntityId, chargeId)
      ),
    });

    if (chargeMap?.metadata && typeof chargeMap.metadata === "object") {
      // Look up payment by charge's payment intent
      const charge = await stripe.charges.retrieve(chargeId, {
        stripeAccount: integration.stripeAccountId,
      });
      const piId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;

      if (piId) {
        const existingPayment = await db.query.payment.findFirst({
          where: and(
            eq(payment.organizationId, integration.organizationId),
            eq(payment.stripePaymentIntentId, piId)
          ),
        });

        if (existingPayment) {
          const allocations = await db.query.paymentAllocation.findMany({
            where: eq(paymentAllocation.paymentId, existingPayment.id),
          });

          for (const alloc of allocations) {
            if (alloc.documentType !== "invoice") continue;
            const inv = await db.query.invoice.findFirst({
              where: eq(invoice.id, alloc.documentId),
            });
            if (!inv) continue;

            const newAmountPaid = Math.max(0, inv.amountPaid - dispute.amount);
            const newAmountDue = inv.total - newAmountPaid;
            await db
              .update(invoice)
              .set({
                amountPaid: newAmountPaid,
                amountDue: newAmountDue,
                status: newAmountPaid <= 0 ? "sent" : newAmountPaid < inv.total ? "partial" : "paid",
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, inv.id));
          }
        }
      }
    }
  }
}

export async function handleDisputeClosed(
  integration: Integration,
  dispute: Stripe.Dispute
) {
  if (!integration.revenueAccountId) {
    throw new Error("Stripe integration accounts not configured");
  }

  // Only reverse if merchant won the dispute
  if (dispute.status !== "won") return;

  // Check if we have the original dispute entry
  const disputeMap = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "dispute"),
      eq(stripeEntityMap.stripeEntityId, dispute.id)
    ),
  });

  if (!disputeMap) return;

  // Check for duplicate reversal
  if (await isDuplicate(integration.organizationId, "dispute_reversal", dispute.id)) return;

  const disputeAccountId = await resolveOrCreateAccount(
    integration.organizationId,
    "Stripe Disputes",
    "liability",
    "current_liability",
    "STRIPE-DISPUTES"
  );

  const closeDate = new Date().toISOString().slice(0, 10);
  const currencyCode = dispute.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // Reverse: DR Dispute Liability, CR Revenue
  const [reversalEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: closeDate,
      description: `Stripe dispute won ${dispute.id}`,
      reference: dispute.id,
      status: "posted",
      sourceType: "stripe_dispute_reversal",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: reversalEntry.id,
      accountId: disputeAccountId,
      description: `Stripe dispute reversal ${dispute.id}`,
      debitAmount: dispute.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: reversalEntry.id,
      accountId: integration.revenueAccountId,
      description: `Stripe dispute reversal ${dispute.id}`,
      debitAmount: 0,
      creditAmount: dispute.amount,
      currencyCode,
    },
  ]);

  await insertEntityMap(
    integration.organizationId,
    "dispute_reversal",
    dispute.id,
    "journal_entry",
    reversalEntry.id,
    { amount: dispute.amount, currency: currencyCode }
  );

  // Reverse dispute fee if applicable
  if (integration.feesAccountId && integration.clearingAccountId) {
    // Stripe charges a dispute fee when created and refunds it when won
    // The fee is typically in the balance_transactions on the dispute
    const balanceTxs = dispute.balance_transactions ?? [];
    const reversalTx = balanceTxs.find((bt) => bt.reporting_category === "dispute_reversal");
    if (reversalTx) {
      const feeRefund = Math.abs(reversalTx.fee);
      if (feeRefund > 0) {
        const feeEntryNumber = await getNextEntryNumber(integration.organizationId);
        const [feeReversalEntry] = await db
          .insert(journalEntry)
          .values({
            organizationId: integration.organizationId,
            entryNumber: feeEntryNumber,
            date: closeDate,
            description: `Stripe dispute fee reversal ${dispute.id}`,
            reference: dispute.id,
            status: "posted",
            sourceType: "stripe_fee_refund",
            postedAt: new Date(),
            createdBy: integration.connectedBy,
          })
          .returning();

        await db.insert(journalLine).values([
          {
            journalEntryId: feeReversalEntry.id,
            accountId: integration.clearingAccountId,
            description: `Stripe dispute fee reversal`,
            debitAmount: feeRefund,
            creditAmount: 0,
            currencyCode,
          },
          {
            journalEntryId: feeReversalEntry.id,
            accountId: integration.feesAccountId,
            description: `Stripe dispute fee reversal`,
            debitAmount: 0,
            creditAmount: feeRefund,
            currencyCode,
          },
        ]);
      }
    }
  }
}

export async function handleInvoicePaid(
  integration: Integration,
  stripeInvoice: Stripe.Invoice
) {
  const invoiceId = stripeInvoice.id;
  if (!invoiceId) return;

  // Check if we already processed this invoice
  if (await isDuplicate(integration.organizationId, "stripe_invoice", invoiceId)) return;

  // Extract payment_intent ID for dedup and payment overlap checks
  const invoiceRaw = stripeInvoice as unknown as Record<string, unknown>;
  const invoiceChargeId = typeof invoiceRaw.charge === "string" ? invoiceRaw.charge : null;
  const invoicePIId = typeof invoiceRaw.payment_intent === "string" ? invoiceRaw.payment_intent : null;

  // Prevent double-booking: if this invoice's charge was already processed by handleChargeSucceeded, skip
  if (invoiceChargeId && await isDuplicate(integration.organizationId, "charge", invoiceChargeId)) return;

  // Fallback: check via payment_intent if charge field isn't present
  if (!invoiceChargeId && invoicePIId) {
    const pi = await stripe.paymentIntents.retrieve(invoicePIId, { stripeAccount: integration.stripeAccountId });
    const latestChargeId = typeof pi.latest_charge === "string"
      ? pi.latest_charge
      : (pi.latest_charge as { id?: string } | null)?.id ?? null;
    if (latestChargeId && await isDuplicate(integration.organizationId, "charge", latestChargeId)) return;
  }

  if (
    !integration.clearingAccountId ||
    !integration.revenueAccountId ||
    !integration.feesAccountId
  ) {
    throw new Error("Stripe integration accounts not configured");
  }

  const amountPaid = stripeInvoice.amount_paid;
  if (!amountPaid || amountPaid <= 0) return;

  // Try to find matching internal invoice by customer mapping
  const customerId = typeof stripeInvoice.customer === "string"
    ? stripeInvoice.customer
    : (stripeInvoice.customer as { id?: string } | null)?.id ?? null;

  const contactId = await resolveContact(
    integration,
    customerId,
    stripeInvoice.customer_email ?? null,
    stripeInvoice.customer_name ?? null
  );

  const paidDate = stripeInvoice.status_transitions?.paid_at
    ? new Date(stripeInvoice.status_transitions.paid_at * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const currencyCode = stripeInvoice.currency.toUpperCase();

  // Extract tax info (compute from total - subtotal, or sum total_taxes)
  const subtotal = stripeInvoice.subtotal ?? amountPaid;
  const taxTotal = amountPaid - subtotal;

  // Create journal entry: DR Clearing, CR Revenue (and CR Tax Liability if applicable)
  const entryNumber = await getNextEntryNumber(integration.organizationId);
  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: paidDate,
      description: `Stripe invoice payment ${invoiceId}`,
      reference: invoiceId,
      status: "posted",
      sourceType: "stripe_charge",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  if (taxTotal > 0) {
    // 3-line entry: DR Clearing, CR Revenue (subtotal), CR Tax Liability (tax)
    const taxAccountId = await resolveOrCreateAccount(
      integration.organizationId,
      "Tax Liability",
      "liability",
      "current_liability",
      "2200"
    );

    await db.insert(journalLine).values([
      {
        journalEntryId: entry.id,
        accountId: integration.clearingAccountId,
        description: `Stripe invoice payment ${invoiceId}`,
        debitAmount: amountPaid,
        creditAmount: 0,
        currencyCode,
      },
      {
        journalEntryId: entry.id,
        accountId: integration.revenueAccountId,
        description: `Stripe invoice payment ${invoiceId}`,
        debitAmount: 0,
        creditAmount: subtotal,
        currencyCode,
      },
      {
        journalEntryId: entry.id,
        accountId: taxAccountId,
        description: `Stripe invoice tax ${invoiceId}`,
        debitAmount: 0,
        creditAmount: taxTotal,
        currencyCode,
      },
    ]);
  } else {
    // 2-line entry: DR Clearing, CR Revenue (unchanged behavior)
    await db.insert(journalLine).values([
      {
        journalEntryId: entry.id,
        accountId: integration.clearingAccountId,
        description: `Stripe invoice payment ${invoiceId}`,
        debitAmount: amountPaid,
        creditAmount: 0,
        currencyCode,
      },
      {
        journalEntryId: entry.id,
        accountId: integration.revenueAccountId,
        description: `Stripe invoice payment ${invoiceId}`,
        debitAmount: 0,
        creditAmount: amountPaid,
        currencyCode,
      },
    ]);
  }

  // Create payment record if we have a contact, but skip if a payment already exists
  // for this PI (e.g. created by checkout.session.completed for a Dubbl invoice)
  if (contactId) {
    let paymentExists = false;
    if (invoicePIId) {
      const existing = await db.query.payment.findFirst({
        where: and(
          eq(payment.organizationId, integration.organizationId),
          eq(payment.stripePaymentIntentId, invoicePIId)
        ),
      });
      paymentExists = !!existing;
    }

    if (!paymentExists) {
      const paymentNumber = await getNextNumber(
        integration.organizationId,
        "payment",
        "payment_number",
        "PAY"
      );

      await db.insert(payment).values({
        organizationId: integration.organizationId,
        contactId,
        paymentNumber,
        type: "received",
        date: paidDate,
        amount: amountPaid,
        method: "card",
        reference: invoiceId,
        currencyCode,
        journalEntryId: entry.id,
        createdBy: integration.connectedBy,
      });
    }
  }

  await insertEntityMap(
    integration.organizationId,
    "stripe_invoice",
    invoiceId,
    "journal_entry",
    entry.id,
    { amount: amountPaid, currency: currencyCode }
  );
}

export async function handleInvoiceVoided(
  integration: Integration,
  stripeInvoice: Stripe.Invoice
) {
  // Look up entity map for this invoice
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "stripe_invoice"),
      eq(stripeEntityMap.stripeEntityId, stripeInvoice.id)
    ),
  });

  if (!mapped) return;

  // Void the linked journal entry
  await db
    .update(journalEntry)
    .set({
      status: "void",
      voidReason: "Stripe invoice voided",
      updatedAt: new Date(),
    })
    .where(eq(journalEntry.id, mapped.dubblEntityId));

  // Update entity map metadata
  await db
    .update(stripeEntityMap)
    .set({
      metadata: {
        ...(mapped.metadata as Record<string, unknown> ?? {}),
        voided: true,
      },
    })
    .where(eq(stripeEntityMap.id, mapped.id));
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

// ──────────────────────────────────────────────────
// Subscription lifecycle handlers
// ──────────────────────────────────────────────────

export async function handleSubscriptionCreated(
  integration: Integration,
  subscription: Stripe.Subscription
) {
  if (await isDuplicate(integration.organizationId, "subscription", subscription.id)) return;

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;

  const contactId = await resolveContact(integration, customerId, null, null);

  await insertEntityMap(
    integration.organizationId,
    "subscription",
    subscription.id,
    "contact",
    contactId ?? subscription.id,
    {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: subscription.items?.data?.map((item) => ({
        priceId: item.price?.id,
        amount: item.price?.unit_amount,
        interval: item.price?.recurring?.interval,
        quantity: item.quantity,
      })),
    }
  );
}

export async function handleSubscriptionUpdated(
  integration: Integration,
  subscription: Stripe.Subscription
) {
  const existing = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "subscription"),
      eq(stripeEntityMap.stripeEntityId, subscription.id)
    ),
  });

  if (existing) {
    await db
      .update(stripeEntityMap)
      .set({
        metadata: {
          ...(existing.metadata as Record<string, unknown> ?? {}),
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          items: subscription.items?.data?.map((item) => ({
            priceId: item.price?.id,
            amount: item.price?.unit_amount,
            interval: item.price?.recurring?.interval,
            quantity: item.quantity,
          })),
        },
      })
      .where(eq(stripeEntityMap.id, existing.id));
  } else {
    await handleSubscriptionCreated(integration, subscription);
  }
}

export async function handleSubscriptionDeleted(
  integration: Integration,
  subscription: Stripe.Subscription
) {
  const existing = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "subscription"),
      eq(stripeEntityMap.stripeEntityId, subscription.id)
    ),
  });

  if (existing) {
    await db
      .update(stripeEntityMap)
      .set({
        metadata: {
          ...(existing.metadata as Record<string, unknown> ?? {}),
          status: "canceled",
          canceledAt: subscription.canceled_at,
        },
      })
      .where(eq(stripeEntityMap.id, existing.id));
  } else {
    await insertEntityMap(
      integration.organizationId,
      "subscription",
      subscription.id,
      "contact",
      subscription.id,
      { status: "canceled", canceledAt: subscription.canceled_at }
    );
  }
}

// ──────────────────────────────────────────────────
// Failed payment handlers
// ──────────────────────────────────────────────────

export async function handleInvoicePaymentFailed(
  integration: Integration,
  stripeInvoice: Stripe.Invoice
) {
  const invoiceId = stripeInvoice.id;
  if (!invoiceId) return;
  if (await isDuplicate(integration.organizationId, "invoice_payment_failed", invoiceId)) return;

  const customerId = typeof stripeInvoice.customer === "string"
    ? stripeInvoice.customer
    : (stripeInvoice.customer as { id?: string } | null)?.id ?? null;

  await resolveContact(
    integration,
    customerId,
    stripeInvoice.customer_email ?? null,
    stripeInvoice.customer_name ?? null
  );

  const reason = stripeInvoice.last_finalization_error?.message ?? "Payment failed";

  await insertEntityMap(
    integration.organizationId,
    "invoice_payment_failed",
    invoiceId,
    "notification",
    "none",
    { reason, amount: stripeInvoice.amount_due }
  );

  if (integration.connectedBy) {
    await sendNotification({
      orgId: integration.organizationId,
      userId: integration.connectedBy,
      type: "stripe_payment_failed",
      title: `Stripe invoice payment failed`,
      body: `Invoice ${invoiceId}: ${reason} (${(stripeInvoice.amount_due / 100).toFixed(2)} ${stripeInvoice.currency.toUpperCase()})`,
      entityType: "stripe_invoice",
      entityId: invoiceId,
    });
  }
}

export async function handlePaymentIntentFailed(
  integration: Integration,
  paymentIntent: Stripe.PaymentIntent
) {
  if (await isDuplicate(integration.organizationId, "payment_intent_failed", paymentIntent.id)) return;

  const existingPayment = await db.query.payment.findFirst({
    where: and(
      eq(payment.organizationId, integration.organizationId),
      eq(payment.stripePaymentIntentId, paymentIntent.id)
    ),
  });

  const reason = paymentIntent.last_payment_error?.message ?? "Payment failed";

  await insertEntityMap(
    integration.organizationId,
    "payment_intent_failed",
    paymentIntent.id,
    "notification",
    existingPayment?.id ?? "none",
    { reason, amount: paymentIntent.amount }
  );

  if (integration.connectedBy) {
    await sendNotification({
      orgId: integration.organizationId,
      userId: integration.connectedBy,
      type: "stripe_payment_failed",
      title: `Stripe payment failed`,
      body: `PaymentIntent ${paymentIntent.id}: ${reason} (${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()})`,
      entityType: "payment_intent",
      entityId: paymentIntent.id,
    });
  }
}

// ──────────────────────────────────────────────────
// Customer deleted handler
// ──────────────────────────────────────────────────

export async function handleCustomerDeleted(
  integration: Integration,
  customer: Stripe.Customer | Stripe.DeletedCustomer
) {
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "customer"),
      eq(stripeEntityMap.stripeEntityId, customer.id)
    ),
  });

  if (!mapped) return;

  await db
    .update(stripeEntityMap)
    .set({
      metadata: {
        ...(mapped.metadata as Record<string, unknown> ?? {}),
        stripeDeleted: true,
        deletedAt: new Date().toISOString(),
      },
    })
    .where(eq(stripeEntityMap.id, mapped.id));
}

// ──────────────────────────────────────────────────
// Charge expired handler
// ──────────────────────────────────────────────────

export async function handleChargeExpired(
  integration: Integration,
  charge: Stripe.Charge
) {
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "charge"),
      eq(stripeEntityMap.stripeEntityId, charge.id)
    ),
  });

  if (!mapped) return;

  // Void the linked journal entry (revenue)
  await db
    .update(journalEntry)
    .set({
      status: "void",
      voidReason: "Stripe uncaptured charge expired",
      updatedAt: new Date(),
    })
    .where(eq(journalEntry.id, mapped.dubblEntityId));

  // Also void any fee entry for this charge (stored as separate journal entry with same reference)
  await db
    .update(journalEntry)
    .set({
      status: "void",
      voidReason: "Stripe uncaptured charge expired",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(journalEntry.organizationId, integration.organizationId),
        eq(journalEntry.reference, charge.id),
        eq(journalEntry.sourceType, "stripe_fee")
      )
    );

  await db
    .update(stripeEntityMap)
    .set({
      metadata: {
        ...(mapped.metadata as Record<string, unknown> ?? {}),
        expired: true,
      },
    })
    .where(eq(stripeEntityMap.id, mapped.id));
}

// ──────────────────────────────────────────────────
// Transfer tracking handlers
// ──────────────────────────────────────────────────

export async function handleTransferCreated(
  integration: Integration,
  transfer: Stripe.Transfer
) {
  if (await isDuplicate(integration.organizationId, "transfer", transfer.id)) return;

  if (!integration.clearingAccountId) {
    throw new Error("Stripe integration clearing account not configured");
  }

  const transferAccountId = await resolveOrCreateAccount(
    integration.organizationId,
    "Stripe Transfers",
    "liability",
    "current_liability",
    "STRIPE-TRANSFERS"
  );

  const transferDate = new Date(transfer.created * 1000).toISOString().slice(0, 10);
  const currencyCode = transfer.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // DR Stripe Transfers, CR Stripe Clearing
  const [transferEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: transferDate,
      description: `Stripe transfer ${transfer.id}`,
      reference: transfer.id,
      status: "posted",
      sourceType: "stripe_transfer",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: transferEntry.id,
      accountId: transferAccountId,
      description: `Stripe transfer ${transfer.id}`,
      debitAmount: transfer.amount,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: transferEntry.id,
      accountId: integration.clearingAccountId,
      description: `Stripe transfer ${transfer.id}`,
      debitAmount: 0,
      creditAmount: transfer.amount,
      currencyCode,
    },
  ]);

  await insertEntityMap(
    integration.organizationId,
    "transfer",
    transfer.id,
    "journal_entry",
    transferEntry.id,
    {
      amount: transfer.amount,
      currency: currencyCode,
      destination: typeof transfer.destination === "string"
        ? transfer.destination
        : transfer.destination?.id ?? null,
    }
  );
}

export async function handleTransferReversed(
  integration: Integration,
  transfer: Stripe.Transfer
) {
  if (await isDuplicate(integration.organizationId, "transfer_reversal", transfer.id)) return;

  if (!integration.clearingAccountId) {
    throw new Error("Stripe integration clearing account not configured");
  }

  // Look up original transfer
  const originalMap = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "transfer"),
      eq(stripeEntityMap.stripeEntityId, transfer.id)
    ),
  });

  if (!originalMap) return;

  const transferAccountId = await resolveOrCreateAccount(
    integration.organizationId,
    "Stripe Transfers",
    "liability",
    "current_liability",
    "STRIPE-TRANSFERS"
  );

  const reversalDate = new Date().toISOString().slice(0, 10);
  const currencyCode = transfer.currency.toUpperCase();
  const entryNumber = await getNextEntryNumber(integration.organizationId);

  // DR Clearing, CR Stripe Transfers
  const [reversalEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: reversalDate,
      description: `Stripe transfer reversal ${transfer.id}`,
      reference: transfer.id,
      status: "posted",
      sourceType: "stripe_transfer_reversal",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  await db.insert(journalLine).values([
    {
      journalEntryId: reversalEntry.id,
      accountId: integration.clearingAccountId,
      description: `Stripe transfer reversal ${transfer.id}`,
      debitAmount: transfer.amount_reversed,
      creditAmount: 0,
      currencyCode,
    },
    {
      journalEntryId: reversalEntry.id,
      accountId: transferAccountId,
      description: `Stripe transfer reversal ${transfer.id}`,
      debitAmount: 0,
      creditAmount: transfer.amount_reversed,
      currencyCode,
    },
  ]);

  await insertEntityMap(
    integration.organizationId,
    "transfer_reversal",
    transfer.id,
    "journal_entry",
    reversalEntry.id,
    { reversedAmount: transfer.amount_reversed, currency: currencyCode }
  );
}

// ──────────────────────────────────────────────────
// Credit note handlers
// ──────────────────────────────────────────────────

export async function handleStripeCreditNoteCreated(
  integration: Integration,
  stripeCN: Stripe.CreditNote
) {
  if (await isDuplicate(integration.organizationId, "stripe_credit_note", stripeCN.id)) return;

  if (!integration.revenueAccountId) {
    throw new Error("Stripe integration revenue account not configured");
  }

  // Resolve contact from customer
  const customerId = typeof stripeCN.customer === "string"
    ? stripeCN.customer
    : (stripeCN.customer as { id?: string } | null)?.id ?? null;

  const contactId = await resolveContact(integration, customerId, null, null);
  if (!contactId) {
    throw new Error("Could not resolve contact for credit note");
  }

  // Generate credit note number
  const creditNoteNumber = await getNextNumber(
    integration.organizationId,
    "credit_note",
    "credit_note_number",
    "CN"
  );

  // Find linked internal invoice if exists
  let linkedInvoiceId: string | null = null;
  if (stripeCN.invoice) {
    const invoiceStripeId = typeof stripeCN.invoice === "string"
      ? stripeCN.invoice
      : stripeCN.invoice.id;
    const invoiceMap = await db.query.stripeEntityMap.findFirst({
      where: and(
        eq(stripeEntityMap.organizationId, integration.organizationId),
        eq(stripeEntityMap.stripeEntityType, "stripe_invoice"),
        eq(stripeEntityMap.stripeEntityId, invoiceStripeId)
      ),
    });
    if (invoiceMap) {
      // The dubblEntityId points to a journal_entry, but we need the invoice ID
      // Check if there's a linked invoice via the payment
      linkedInvoiceId = null; // We store the reference but don't force a link
    }
  }

  const issueDate = new Date(stripeCN.created * 1000).toISOString().slice(0, 10);
  const currencyCode = stripeCN.currency.toUpperCase();

  // Insert credit note record
  const [newCN] = await db
    .insert(creditNote)
    .values({
      organizationId: integration.organizationId,
      contactId,
      invoiceId: linkedInvoiceId,
      creditNoteNumber,
      issueDate,
      status: "sent",
      reference: stripeCN.id,
      subtotal: stripeCN.subtotal,
      taxTotal: (stripeCN.total - stripeCN.subtotal),
      total: stripeCN.total,
      amountApplied: stripeCN.total,
      amountRemaining: 0,
      currencyCode,
      sentAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  // Insert credit note lines
  const lines = stripeCN.lines?.data ?? [];
  if (lines.length > 0) {
    await db.insert(creditNoteLine).values(
      lines.map((line, idx) => ({
        creditNoteId: newCN.id,
        description: line.description ?? `Credit note line ${idx + 1}`,
        quantity: (line.quantity ?? 1) * 100,
        unitPrice: line.unit_amount ?? 0,
        accountId: integration.revenueAccountId!,
        amount: line.amount,
        sortOrder: idx,
      }))
    );
  }

  // Create journal entry
  const entryNumber = await getNextEntryNumber(integration.organizationId);
  const journalLines: {
    journalEntryId: string;
    accountId: string;
    description: string;
    debitAmount: number;
    creditAmount: number;
    currencyCode: string;
  }[] = [];

  const [cnEntry] = await db
    .insert(journalEntry)
    .values({
      organizationId: integration.organizationId,
      entryNumber,
      date: issueDate,
      description: `Stripe credit note ${stripeCN.id}`,
      reference: stripeCN.id,
      status: "posted",
      sourceType: "stripe_credit_note",
      postedAt: new Date(),
      createdBy: integration.connectedBy,
    })
    .returning();

  // DR Revenue for subtotal
  journalLines.push({
    journalEntryId: cnEntry.id,
    accountId: integration.revenueAccountId,
    description: `Stripe credit note ${stripeCN.id}`,
    debitAmount: stripeCN.subtotal,
    creditAmount: 0,
    currencyCode,
  });

  // DR Tax Liability if tax > 0
  const taxAmount = (stripeCN.total - stripeCN.subtotal);
  if (taxAmount > 0) {
    const taxAccountId = await resolveOrCreateAccount(
      integration.organizationId,
      "Tax Liability",
      "liability",
      "current_liability",
      "2200"
    );
    journalLines.push({
      journalEntryId: cnEntry.id,
      accountId: taxAccountId,
      description: `Stripe credit note tax ${stripeCN.id}`,
      debitAmount: taxAmount,
      creditAmount: 0,
      currencyCode,
    });
  }

  // CR Accounts Receivable for total
  const arAccountId = await resolveOrCreateAccount(
    integration.organizationId,
    "Accounts Receivable",
    "asset",
    "current_asset",
    "1200"
  );
  journalLines.push({
    journalEntryId: cnEntry.id,
    accountId: arAccountId,
    description: `Stripe credit note ${stripeCN.id}`,
    debitAmount: 0,
    creditAmount: stripeCN.total,
    currencyCode,
  });

  await db.insert(journalLine).values(journalLines);

  // Update credit note with journal entry ID
  await db
    .update(creditNote)
    .set({ journalEntryId: cnEntry.id })
    .where(eq(creditNote.id, newCN.id));

  await insertEntityMap(
    integration.organizationId,
    "stripe_credit_note",
    stripeCN.id,
    "credit_note",
    newCN.id,
    { amount: stripeCN.total, invoiceId: linkedInvoiceId }
  );
}

export async function handleStripeCreditNoteUpdated(
  integration: Integration,
  stripeCN: Stripe.CreditNote
) {
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "stripe_credit_note"),
      eq(stripeEntityMap.stripeEntityId, stripeCN.id)
    ),
  });

  if (!mapped) {
    await handleStripeCreditNoteCreated(integration, stripeCN);
    return;
  }

  // Update local credit note amounts
  await db
    .update(creditNote)
    .set({
      subtotal: stripeCN.subtotal,
      taxTotal: (stripeCN.total - stripeCN.subtotal),
      total: stripeCN.total,
      updatedAt: new Date(),
    })
    .where(eq(creditNote.id, mapped.dubblEntityId));

  // Update linked journal entry lines to match new amounts
  const cn = await db.query.creditNote.findFirst({
    where: eq(creditNote.id, mapped.dubblEntityId),
  });

  if (cn?.journalEntryId) {
    // Void old journal entry and create a corrected one
    await db
      .update(journalEntry)
      .set({
        status: "void",
        voidReason: "Stripe credit note amounts updated",
        updatedAt: new Date(),
      })
      .where(eq(journalEntry.id, cn.journalEntryId));

    if (!integration.revenueAccountId) return;

    const currencyCode = stripeCN.currency.toUpperCase();
    const issueDate = new Date(stripeCN.created * 1000).toISOString().slice(0, 10);
    const entryNumber = await getNextEntryNumber(integration.organizationId);

    const newJournalLines: {
      journalEntryId: string;
      accountId: string;
      description: string;
      debitAmount: number;
      creditAmount: number;
      currencyCode: string;
    }[] = [];

    const [newEntry] = await db
      .insert(journalEntry)
      .values({
        organizationId: integration.organizationId,
        entryNumber,
        date: issueDate,
        description: `Stripe credit note ${stripeCN.id} (updated)`,
        reference: stripeCN.id,
        status: "posted",
        sourceType: "stripe_credit_note",
        postedAt: new Date(),
        createdBy: integration.connectedBy,
      })
      .returning();

    // DR Revenue for subtotal
    newJournalLines.push({
      journalEntryId: newEntry.id,
      accountId: integration.revenueAccountId,
      description: `Stripe credit note ${stripeCN.id}`,
      debitAmount: stripeCN.subtotal,
      creditAmount: 0,
      currencyCode,
    });

    // DR Tax Liability if tax > 0
    const taxAmount = stripeCN.total - stripeCN.subtotal;
    if (taxAmount > 0) {
      const taxAccountId = await resolveOrCreateAccount(
        integration.organizationId,
        "Tax Liability",
        "liability",
        "current_liability",
        "2200"
      );
      newJournalLines.push({
        journalEntryId: newEntry.id,
        accountId: taxAccountId,
        description: `Stripe credit note tax ${stripeCN.id}`,
        debitAmount: taxAmount,
        creditAmount: 0,
        currencyCode,
      });
    }

    // CR Accounts Receivable for total
    const arAccountId = await resolveOrCreateAccount(
      integration.organizationId,
      "Accounts Receivable",
      "asset",
      "current_asset",
      "1200"
    );
    newJournalLines.push({
      journalEntryId: newEntry.id,
      accountId: arAccountId,
      description: `Stripe credit note ${stripeCN.id}`,
      debitAmount: 0,
      creditAmount: stripeCN.total,
      currencyCode,
    });

    await db.insert(journalLine).values(newJournalLines);

    // Update credit note to point to new journal entry
    await db
      .update(creditNote)
      .set({ journalEntryId: newEntry.id })
      .where(eq(creditNote.id, mapped.dubblEntityId));
  }
}

export async function handleStripeCreditNoteVoided(
  integration: Integration,
  stripeCN: Stripe.CreditNote
) {
  const mapped = await db.query.stripeEntityMap.findFirst({
    where: and(
      eq(stripeEntityMap.organizationId, integration.organizationId),
      eq(stripeEntityMap.stripeEntityType, "stripe_credit_note"),
      eq(stripeEntityMap.stripeEntityId, stripeCN.id)
    ),
  });

  if (!mapped) return;

  // Void linked journal entry
  const cn = await db.query.creditNote.findFirst({
    where: eq(creditNote.id, mapped.dubblEntityId),
  });

  if (cn?.journalEntryId) {
    await db
      .update(journalEntry)
      .set({
        status: "void",
        voidReason: "Stripe credit note voided",
        updatedAt: new Date(),
      })
      .where(eq(journalEntry.id, cn.journalEntryId));
  }

  // Void local credit note
  await db
    .update(creditNote)
    .set({
      status: "void",
      voidedAt: new Date(),
      amountRemaining: 0,
      updatedAt: new Date(),
    })
    .where(eq(creditNote.id, mapped.dubblEntityId));

  // Update entity map metadata
  await db
    .update(stripeEntityMap)
    .set({
      metadata: {
        ...(mapped.metadata as Record<string, unknown> ?? {}),
        voided: true,
      },
    })
    .where(eq(stripeEntityMap.id, mapped.id));
}

// ──────────────────────────────────────────────────
// Unified event processor
// ──────────────────────────────────────────────────

export async function processStripeEvent(
  event: Stripe.Event,
  integration: Integration
): Promise<{ action: string }> {
  switch (event.type) {
    case "charge.succeeded": {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeSucceeded(integration, charge);
      return { action: "charge_succeeded" };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeRefunded(integration, charge);
      return { action: "charge_refunded" };
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDisputeCreated(integration, dispute);
      return { action: "dispute_created" };
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDisputeClosed(integration, dispute);
      return { action: "dispute_closed" };
    }
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      await handlePayoutPaid(integration, payout);
      return { action: "payout_paid" };
    }
    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      await handlePayoutFailed(integration, payout);
      return { action: "payout_failed" };
    }
    case "payout.canceled": {
      const payout = event.data.object as Stripe.Payout;
      await handlePayoutCanceled(integration, payout);
      return { action: "payout_canceled" };
    }
    case "payout.updated": {
      const payout = event.data.object as Stripe.Payout;
      if (payout.status === "canceled") {
        await handlePayoutCanceled(integration, payout);
        return { action: "payout_canceled" };
      }
      if (payout.status === "reversed") {
        await handlePayoutReversed(integration, payout);
        return { action: "payout_reversed" };
      }
      return { action: "skipped" };
    }
    case "customer.created": {
      const customer = event.data.object as Stripe.Customer;
      await handleCustomerCreated(integration, customer);
      return { action: "customer_created" };
    }
    case "customer.updated": {
      const customer = event.data.object as Stripe.Customer;
      await handleCustomerUpdated(integration, customer);
      return { action: "customer_updated" };
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      await handleInvoicePaid(integration, inv);
      return { action: "invoice_paid" };
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      await handleInvoicePaymentFailed(integration, inv);
      return { action: "invoice_payment_failed" };
    }
    case "invoice.voided": {
      const inv = event.data.object as Stripe.Invoice;
      await handleInvoiceVoided(integration, inv);
      return { action: "invoice_voided" };
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentFailed(integration, pi);
      return { action: "payment_intent_failed" };
    }
    case "customer.deleted": {
      const customer = event.data.object as Stripe.Customer | Stripe.DeletedCustomer;
      await handleCustomerDeleted(integration, customer);
      return { action: "customer_deleted" };
    }
    case "charge.expired": {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeExpired(integration, charge);
      return { action: "charge_expired" };
    }
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      await handleTransferCreated(integration, transfer);
      return { action: "transfer_created" };
    }
    case "transfer.reversed": {
      const transfer = event.data.object as Stripe.Transfer;
      await handleTransferReversed(integration, transfer);
      return { action: "transfer_reversed" };
    }
    case "credit_note.created": {
      const cn = event.data.object as Stripe.CreditNote;
      await handleStripeCreditNoteCreated(integration, cn);
      return { action: "credit_note_created" };
    }
    case "credit_note.updated": {
      const cn = event.data.object as Stripe.CreditNote;
      await handleStripeCreditNoteUpdated(integration, cn);
      return { action: "credit_note_updated" };
    }
    case "credit_note.voided": {
      const cn = event.data.object as Stripe.CreditNote;
      await handleStripeCreditNoteVoided(integration, cn);
      return { action: "credit_note_voided" };
    }
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionCreated(integration, sub);
      return { action: "subscription_created" };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(integration, sub);
      return { action: "subscription_updated" };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(integration, sub);
      return { action: "subscription_deleted" };
    }
    default:
      return { action: "skipped" };
  }
}
