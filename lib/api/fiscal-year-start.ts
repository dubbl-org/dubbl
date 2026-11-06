import { db } from "@/lib/db";
import { fiscalYear, organization } from "@/lib/db/schema";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { fiscalYearStartFor } from "@/lib/reports/fiscal-year-start";

/** First day of the organization's financial year containing `date` (YYYY-MM-DD). */
export async function getFiscalYearStart(organizationId: string, date: string): Promise<string> {
  const [org] = await db
    .select({ startMonth: organization.fiscalYearStartMonth })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const years = await db
    .select({ startDate: fiscalYear.startDate, endDate: fiscalYear.endDate })
    .from(fiscalYear)
    .where(
      and(
        eq(fiscalYear.organizationId, organizationId),
        isNull(fiscalYear.deletedAt),
        lte(fiscalYear.startDate, date),
        gte(fiscalYear.endDate, date)
      )
    );
  return fiscalYearStartFor(date, org?.startMonth, years);
}
