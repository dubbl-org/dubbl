import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, validationError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { listContactPeople } from "@/lib/api/contact-people";

/**
 * GET /api/v1/contacts/people
 *
 * Every contact person across all of the organization's contacts, with the
 * company they belong to. Optional: search (person name, email, phone, job
 * title or company name), contactId, type=customer|supplier, primary=1,
 * page, limit.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const type = url.searchParams.get("type");
    const primary = url.searchParams.get("primary");
    const contactId = url.searchParams.get("contactId");
    if (contactId && !/^[0-9a-f-]{36}$/i.test(contactId)) {
      return validationError("contactId must be a UUID");
    }

    const { rows, total } = await listContactPeople(ctx.organizationId, {
      search: url.searchParams.get("search"),
      contactId,
      contactType: type === "customer" || type === "supplier" ? type : null,
      primaryOnly: primary === "1" || primary === "true",
      limit,
      offset,
    });

    return NextResponse.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}
