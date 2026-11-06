import { db } from "@/lib/db";
import {
  compensationReview,
  compensationReviewEntry,
  payrollEmployee,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";

export type ReviewStatus = "draft" | "in_progress" | "completed" | "cancelled";

/**
 * Allowed review status changes. Completed and cancelled are final:
 * completing a review writes the new salaries, so it can't be undone here.
 */
export const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["draft", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Entries can only be added or removed while the review is still open. */
const EDITABLE: ReviewStatus[] = ["draft", "in_progress"];

/** Loads a live review of this org, or throws a 404. */
export async function getReviewForOrg(ctx: AuthContext, reviewId: string) {
  const review = await db.query.compensationReview.findFirst({
    where: and(
      eq(compensationReview.id, reviewId),
      eq(compensationReview.organizationId, ctx.organizationId),
      notDeleted(compensationReview.deletedAt)
    ),
  });
  if (!review) throw new AuthError("Compensation review not found", 404);
  return review;
}

export interface AddReviewEntryInput {
  employeeId: string;
  /** Annual salary in cents; defaults to the employee's current salary. */
  currentSalary?: number;
  /** Proposed annual salary in cents. */
  proposedSalary: number;
  adjustmentPercent?: number;
  reason?: string;
}

/** Adds an employee to an open review. The employee must belong to the org. */
export async function addReviewEntry(ctx: AuthContext, reviewId: string, input: AddReviewEntryInput) {
  const review = await getReviewForOrg(ctx, reviewId);
  if (!EDITABLE.includes(review.status)) {
    throw new AuthError(`Entries can't be changed on a ${review.status.replace(/_/g, " ")} review`, 409);
  }

  const employee = await db.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.id, input.employeeId),
      eq(payrollEmployee.organizationId, ctx.organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
  });
  if (!employee) throw new AuthError("Employee not found", 404);

  const existing = await db.query.compensationReviewEntry.findFirst({
    where: and(
      eq(compensationReviewEntry.reviewId, reviewId),
      eq(compensationReviewEntry.employeeId, input.employeeId)
    ),
  });
  if (existing) throw new AuthError(`${employee.name} is already in this review`, 409);

  const currentSalary = input.currentSalary ?? employee.salary;
  const adjustmentPercent =
    input.adjustmentPercent ??
    (currentSalary > 0
      ? Math.round(((input.proposedSalary - currentSalary) / currentSalary) * 10000) / 100
      : null);

  const [entry] = await db
    .insert(compensationReviewEntry)
    .values({
      reviewId,
      employeeId: input.employeeId,
      currentSalary,
      proposedSalary: input.proposedSalary,
      adjustmentPercent,
      reason: input.reason,
    })
    .returning();
  return entry;
}

/** Removes an entry from an open review of this org. */
export async function removeReviewEntry(ctx: AuthContext, reviewId: string, entryId: string) {
  const review = await getReviewForOrg(ctx, reviewId);
  if (!EDITABLE.includes(review.status)) {
    throw new AuthError(`Entries can't be changed on a ${review.status.replace(/_/g, " ")} review`, 409);
  }
  const [deleted] = await db
    .delete(compensationReviewEntry)
    .where(and(eq(compensationReviewEntry.id, entryId), eq(compensationReviewEntry.reviewId, reviewId)))
    .returning();
  if (!deleted) throw new AuthError("Review entry not found", 404);
  return deleted;
}

/**
 * Moves a review to a new status. Completing it sets each approved entry's
 * employee salary to the proposed salary, in one transaction with the status
 * change. An entry counts as approved unless it was explicitly rejected
 * (approved === false); approved entries left undecided are stamped approved.
 */
export async function updateReviewStatus(ctx: AuthContext, reviewId: string, status: ReviewStatus) {
  const review = await getReviewForOrg(ctx, reviewId);
  if (review.status === status) return { review, salariesUpdated: 0 };
  if (!REVIEW_TRANSITIONS[review.status].includes(status)) {
    throw new AuthError(
      `A ${review.status.replace(/_/g, " ")} review can't be moved to ${status.replace(/_/g, " ")}`,
      409
    );
  }

  return db.transaction(async (tx) => {
    // Conditional on the old status so two concurrent completions can't both apply raises
    const [updated] = await tx
      .update(compensationReview)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(compensationReview.id, reviewId), eq(compensationReview.status, review.status)))
      .returning();
    if (!updated) throw new AuthError("This review was changed by someone else. Reload and try again.", 409);

    let salariesUpdated = 0;
    if (status === "completed") {
      const entries = await tx.query.compensationReviewEntry.findMany({
        where: eq(compensationReviewEntry.reviewId, reviewId),
      });
      const approved = entries.filter((e) => e.approved !== false);
      for (const entry of approved) {
        const [emp] = await tx
          .update(payrollEmployee)
          .set({ salary: entry.proposedSalary, updatedAt: new Date() })
          .where(and(
            eq(payrollEmployee.id, entry.employeeId),
            eq(payrollEmployee.organizationId, ctx.organizationId)
          ))
          .returning({ id: payrollEmployee.id });
        if (emp) salariesUpdated++;
      }
      const undecided = approved.filter((e) => e.approved === null).map((e) => e.id);
      if (undecided.length > 0) {
        await tx
          .update(compensationReviewEntry)
          .set({ approved: true })
          .where(inArray(compensationReviewEntry.id, undecided));
      }
    }
    return { review: updated, salariesUpdated };
  });
}
