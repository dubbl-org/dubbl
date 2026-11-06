/**
 * Payroll run lifecycle actions shared by the REST routes and the MCP tools:
 * finishing (posting) a run, voiding a finished run, and deleting a draft.
 * Workflow problems throw ApprovalError, which both layers turn into a 400
 * with the message; locked periods throw PeriodLockedError.
 */
import { db } from "@/lib/db";
import {
  approvalChain,
  approvalRecord,
  member,
  employeeDeduction,
  journalEntry,
  payrollBonus,
  payrollEmployee,
  payrollItem,
  payrollItemDeduction,
  payrollRun,
} from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ApprovalError } from "@/lib/approvals/errors";
import { assertNotLocked } from "@/lib/api/period-lock";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { resolvePayrollSettings } from "@/lib/api/payroll-withholding";
import { syncLeaveBalances } from "@/lib/api/leave-balances";
import { rebuildDraftRunEmployee } from "@/lib/api/payroll-run-builder";
import type { AuthContext } from "@/lib/api/auth-context";

type RunRow = typeof payrollRun.$inferSelect;

async function loadRun(organizationId: string, runId: string) {
  const run = await db.query.payrollRun.findFirst({
    where: and(
      eq(payrollRun.id, runId),
      eq(payrollRun.organizationId, organizationId),
      notDeleted(payrollRun.deletedAt)
    ),
    with: { items: { with: { employee: true } } },
  });
  if (!run) throw new ApprovalError("Payroll run not found", 404);
  return run;
}

/**
 * True when the run has to be signed off before it can be finished: the org
 * has an active approval chain with at least one approver, "Auto-approve
 * payroll runs" is off, and the run isn't approved yet.
 */
export async function runNeedsSignOff(organizationId: string, run: RunRow): Promise<boolean> {
  if (run.approvalStatus === "approved") return false;
  const settings = await resolvePayrollSettings(organizationId);
  if (settings.autoApprovalEnabled) return false;
  const chains = await db.query.approvalChain.findMany({
    where: and(
      eq(approvalChain.organizationId, organizationId),
      eq(approvalChain.isActive, true),
      notDeleted(approvalChain.deletedAt)
    ),
    with: { steps: { columns: { id: true } } },
  });
  return chains.some((c) => c.steps.length > 0);
}

/**
 * Finish a draft run: post ONE balanced journal entry (gross wages DR; each
 * withholding CR to its liability — income tax 2220, FICA 2235, pension and
 * benefits 2245, other deductions 2236; take-home pay CR to the bank, or to
 * Wages Payable 2310 when accrued) and mark it completed, atomically. Then
 * refresh leave balances, since per-pay-period leave accrues on finished runs.
 */
export async function processPayrollRun(
  ctx: AuthContext,
  runId: string,
  opts: { accrued?: boolean } = {}
) {
  const run = await loadRun(ctx.organizationId, runId);

  const isApprovedPendingRun =
    run.status === "pending_approval" && run.approvalStatus === "approved";
  if (run.status !== "draft" && !isApprovedPendingRun) {
    throw new ApprovalError("Only draft payroll runs can be processed");
  }
  if (run.items.length === 0) {
    throw new ApprovalError("This run has nobody to pay");
  }
  if (await runNeedsSignOff(ctx.organizationId, run)) {
    throw new ApprovalError("This run requires approval before processing");
  }

  // The entry is dated the period end; refuse if that period is locked.
  await assertNotLocked(ctx.organizationId, run.payPeriodEnd, ctx);

  const updated = await db.transaction(async (tx) => {
    const journalEntryId = await postPayrollRun(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      run.id,
      tx,
      { accrued: opts.accrued }
    );
    const [row] = await tx
      .update(payrollRun)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(payrollRun.id, run.id))
      .returning();

    // A one-time deduction is taken once: switch it off after the run that took it.
    const taken = await tx
      .select({ employeeId: payrollItem.employeeId, deductionTypeId: payrollItemDeduction.deductionTypeId })
      .from(payrollItemDeduction)
      .innerJoin(payrollItem, eq(payrollItemDeduction.payrollItemId, payrollItem.id))
      .where(eq(payrollItem.payrollRunId, run.id));
    for (const t of taken) {
      await tx
        .update(employeeDeduction)
        .set({ isActive: false })
        .where(and(
          eq(employeeDeduction.employeeId, t.employeeId),
          eq(employeeDeduction.deductionTypeId, t.deductionTypeId),
          eq(employeeDeduction.timing, "one_time"),
          eq(employeeDeduction.isActive, true)
        ));
    }
    return { ...row, journalEntryId };
  });

  await syncLeaveBalances(ctx.organizationId, {
    employeeIds: run.items.map((i) => i.employeeId),
    year: Number(run.payPeriodEnd.slice(0, 4)),
  });

  return { ...updated, items: run.items };
}

/**
 * Void a finished run: post a reversing journal entry (debits and credits
 * swapped, on the original entry's date, so both stay in the books and net to
 * zero) and mark the run void. Voided runs drop out of YTD wages, payslip YTD,
 * W-2s and reports.
 */
export async function voidPayrollRun(ctx: AuthContext, runId: string, reason?: string | null) {
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "completed") {
    throw new ApprovalError("Only finished payroll runs can be voided");
  }

  const entry = run.journalEntryId
    ? await db.query.journalEntry.findFirst({
        where: and(
          eq(journalEntry.id, run.journalEntryId),
          eq(journalEntry.organizationId, ctx.organizationId)
        ),
      })
    : null;
  if (entry && !entry.reversedByEntryId) {
    await assertNotLocked(ctx.organizationId, entry.date, ctx);
  }

  const voided = await db.transaction(async (tx) => {
    let reversalId: string | null = null;
    if (entry && !entry.reversedByEntryId) {
      const reversal = await reverseJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          entryId: entry.id,
          date: entry.date,
          description: `Void of payroll ${run.payPeriodStart} to ${run.payPeriodEnd}${reason ? ` (${reason})` : ""}`,
          reference: entry.reference,
          sourceType: "payroll",
          sourceId: run.id,
        },
        tx
      );
      reversalId = reversal?.id ?? null;
      await tx
        .update(journalEntry)
        .set({ voidedAt: new Date(), voidReason: reason || "Payroll run voided", updatedAt: new Date() })
        .where(eq(journalEntry.id, entry.id));
    }
    const [row] = await tx
      .update(payrollRun)
      .set({
        status: "void",
        notes: reason ? [run.notes, `Voided: ${reason}`].filter(Boolean).join("\n") : run.notes,
      })
      .where(eq(payrollRun.id, run.id))
      .returning();
    return { run: row, reversalEntryId: reversalId };
  });

  await syncLeaveBalances(ctx.organizationId, {
    employeeIds: run.items.map((i) => i.employeeId),
    year: Number(run.payPeriodEnd.slice(0, 4)),
  });

  return voided;
}

/** Delete a run that hasn't been finished (draft or waiting for sign-off). */
export async function deleteDraftPayrollRun(ctx: AuthContext, runId: string) {
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "draft" && run.status !== "pending_approval") {
    throw new ApprovalError("Only unfinished payroll runs can be deleted. Void a finished run instead.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(approvalRecord).where(eq(approvalRecord.payrollRunId, run.id));
    await tx.delete(payrollItem).where(eq(payrollItem.payrollRunId, run.id));
    await tx.update(payrollRun).set(softDelete()).where(eq(payrollRun.id, run.id));
    // A final pay run marks the person as leaving when it's created; deleting
    // it before it's finished undoes that, so they're paid again as usual.
    if (run.runType === "termination") {
      const employeeIds = [...new Set(run.items.map((i) => i.employeeId))];
      if (employeeIds.length > 0) {
        await tx
          .update(payrollEmployee)
          .set({ isActive: true, endDate: null, terminationDate: null, terminationReason: null, updatedAt: new Date() })
          .where(and(eq(payrollEmployee.organizationId, ctx.organizationId), inArray(payrollEmployee.id, employeeIds)));
      }
    }
  });
  if (run.runType === "termination") {
    // Leave paid out in the final pay is theirs again.
    await syncLeaveBalances(ctx.organizationId, { employeeIds: run.items.map((i) => i.employeeId) });
  }
  return run;
}

/**
 * Finish an off-cycle run (final pay, bonus only, correction) straight after
 * creating it, unless the org requires sign-off, in which case it stays a
 * draft to be sent for sign-off like any other run. Returns the run as it ends
 * up.
 */
export async function finishOffCycleRun(ctx: AuthContext, run: RunRow) {
  if (await runNeedsSignOff(ctx.organizationId, run)) {
    return { ...run, needsSignOff: true };
  }
  const processed = await processPayrollRun(ctx, run.id);
  return { ...processed, needsSignOff: false };
}

/** True when every approver id is a member of this org. */
export async function approversInOrg(organizationId: string, approverIds: string[]): Promise<boolean> {
  const unique = [...new Set(approverIds)];
  if (unique.length === 0) return true;
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), inArray(member.id, unique)));
  return rows.length === unique.length;
}

async function currentMemberId(ctx: AuthContext): Promise<string> {
  const me = await db.query.member.findFirst({
    where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!me) throw new ApprovalError("You're not a member of this workspace", 404);
  return me.id;
}

/**
 * Send a draft run for sign-off: one pending approval per step of the first
 * active approval chain that has approvers. A run sent back and sent again
 * starts a fresh round.
 */
export async function submitRunForApproval(ctx: AuthContext, runId: string) {
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "draft") throw new ApprovalError("Only draft runs can be submitted for approval");
  if (run.approvalStatus === "approved") throw new ApprovalError("This run is already signed off");

  const chains = await db.query.approvalChain.findMany({
    where: and(
      eq(approvalChain.organizationId, ctx.organizationId),
      eq(approvalChain.isActive, true),
      notDeleted(approvalChain.deletedAt)
    ),
    with: { steps: true },
    orderBy: asc(approvalChain.createdAt),
  });
  const chain = chains.find((c) => c.steps.length > 0);
  if (!chain) {
    throw new ApprovalError("No active approval chain configured. Add one in Payroll settings under Approval Chains.");
  }
  const steps = [...chain.steps].sort((a, b) => a.stepOrder - b.stepOrder);

  return db.transaction(async (tx) => {
    await tx.delete(approvalRecord).where(eq(approvalRecord.payrollRunId, run.id));
    await tx.insert(approvalRecord).values(
      steps.map((step) => ({
        payrollRunId: run.id,
        stepId: step.id,
        approverId: step.approverId,
        status: "pending" as const,
      }))
    );
    const [row] = await tx
      .update(payrollRun)
      .set({ status: "pending_approval", approvalStatus: "pending" })
      .where(eq(payrollRun.id, run.id))
      .returning();
    return row;
  });
}

/**
 * Approve your step of a run waiting for sign-off. When the last approver
 * signs off, the run goes back to draft marked approved, ready to finish.
 */
export async function approveRun(ctx: AuthContext, runId: string) {
  const memberId = await currentMemberId(ctx);
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "pending_approval") throw new ApprovalError("Run is not pending approval");

  const decided = await db
    .update(approvalRecord)
    .set({ status: "approved", decidedAt: new Date() })
    .where(and(
      eq(approvalRecord.payrollRunId, run.id),
      eq(approvalRecord.approverId, memberId),
      eq(approvalRecord.status, "pending")
    ))
    .returning({ id: approvalRecord.id });
  if (decided.length === 0) throw new ApprovalError("No pending approval found for your account");

  const pending = await db.query.approvalRecord.findMany({
    where: and(eq(approvalRecord.payrollRunId, run.id), eq(approvalRecord.status, "pending")),
    columns: { id: true },
  });
  if (pending.length === 0) {
    await db
      .update(payrollRun)
      .set({ status: "draft", approvalStatus: "approved", approvedBy: memberId, approvedAt: new Date() })
      .where(eq(payrollRun.id, run.id));
  }
  return db.query.payrollRun.findFirst({ where: eq(payrollRun.id, run.id) });
}

/** Send a run back: records your rejection and ends this round of sign-off. */
export async function rejectRun(ctx: AuthContext, runId: string, reason?: string | null) {
  const memberId = await currentMemberId(ctx);
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "pending_approval") throw new ApprovalError("Run is not pending approval");

  return db.transaction(async (tx) => {
    const decided = await tx
      .update(approvalRecord)
      .set({ status: "rejected", comment: reason || null, decidedAt: new Date() })
      .where(and(
        eq(approvalRecord.payrollRunId, run.id),
        eq(approvalRecord.approverId, memberId),
        eq(approvalRecord.status, "pending")
      ))
      .returning({ id: approvalRecord.id });
    if (decided.length === 0) throw new ApprovalError("No pending approval found for your account");
    await tx
      .delete(approvalRecord)
      .where(and(eq(approvalRecord.payrollRunId, run.id), eq(approvalRecord.status, "pending")));
    const [row] = await tx
      .update(payrollRun)
      .set({ status: "draft", approvalStatus: "rejected" })
      .where(eq(payrollRun.id, run.id))
      .returning();
    return row;
  });
}

export type BonusType = "performance" | "signing" | "referral" | "holiday" | "spot" | "retention" | "other";

/**
 * Add a bonus to a draft run. The employee's pay item is recalculated with
 * the bonus in gross and taxed with it, the run totals are updated, and any
 * sign-off is cleared, since the figures changed.
 */
export async function addBonusToRun(
  ctx: AuthContext,
  runId: string,
  input: { employeeId: string; bonusType: BonusType; amount: number; description?: string | null }
) {
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "draft") {
    throw new ApprovalError("Bonuses can only be added to a run that isn't finished or waiting for sign-off");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ApprovalError("Amount must be a positive number of cents");
  const emp = await db.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.id, input.employeeId),
      eq(payrollEmployee.organizationId, ctx.organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
    columns: { id: true },
  });
  if (!emp) throw new ApprovalError("Employee not found", 404);

  return db.transaction(async (tx) => {
    const [bonus] = await tx
      .insert(payrollBonus)
      .values({
        payrollRunId: run.id,
        employeeId: emp.id,
        bonusType: input.bonusType,
        amount: input.amount,
        description: input.description || null,
      })
      .returning();
    const updatedRun = await rebuildDraftRunEmployee(tx, ctx.organizationId, run, emp.id);
    return { bonus, run: updatedRun };
  });
}

/** Remove a bonus from a draft run and recalculate that employee's pay. */
export async function removeBonusFromRun(ctx: AuthContext, runId: string, bonusId: string) {
  const run = await loadRun(ctx.organizationId, runId);
  if (run.status !== "draft") {
    throw new ApprovalError("Bonuses can only be removed from a run that isn't finished or waiting for sign-off");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(payrollBonus)
      .where(and(eq(payrollBonus.id, bonusId), eq(payrollBonus.payrollRunId, run.id)))
      .returning();
    if (!row) throw new ApprovalError("Bonus not found", 404);
    const updatedRun = await rebuildDraftRunEmployee(tx, ctx.organizationId, run, row.employeeId);
    return { bonus: row, run: updatedRun };
  });
}
