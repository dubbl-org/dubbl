import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV } from "@/lib/import-export/csv-utils";

const COLUMNS = [
  "name", "email", "phone", "type", "taxNumber",
  "billingLine1", "billingCity", "billingState", "billingPostalCode", "billingCountry",
];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const contacts = await db.query.contact.findMany({
      where: and(
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt),
      ),
    });

    const rows = contacts.map(c => ({
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      type: c.type,
      taxNumber: c.taxNumber || "",
      billingLine1: c.addresses?.billing?.line1 || "",
      billingCity: c.addresses?.billing?.city || "",
      billingState: c.addresses?.billing?.state || "",
      billingPostalCode: c.addresses?.billing?.postalCode || "",
      billingCountry: c.addresses?.billing?.country || "",
    }));

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=contacts.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
