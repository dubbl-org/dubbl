import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseClaim, publicUserColumns } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/** One expense claim with everything the detail screen renders. */
export async function getExpenseClaim(organizationId: string, claimId: string) {
  return db.query.expenseClaim.findFirst({
    where: and(
      eq(expenseClaim.id, claimId),
      eq(expenseClaim.organizationId, organizationId),
      notDeleted(expenseClaim.deletedAt)
    ),
    with: {
      submittedByUser: { columns: publicUserColumns },
      approvedByUser: { columns: publicUserColumns },
      items: true,
    },
  });
}
