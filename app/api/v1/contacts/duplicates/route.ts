import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { findDuplicateContacts } from "@/lib/api/contact-duplicates";

/**
 * GET /api/v1/contacts/duplicates
 *
 * Groups of contacts that are probably the same company or person: same
 * normalised name (legal suffixes like "Inc" or "Ltd" ignored), same email or
 * same tax number. Each member carries its record counts and unpaid balances
 * (integer cents) so you can choose which one to keep; `suggestedKeepId` is the
 * member with the most records. Tax numbers are returned masked (last 4 only).
 * Merge with POST /api/v1/contacts/{duplicateId}/merge { targetContactId }.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const groups = await findDuplicateContacts(ctx.organizationId);
    return NextResponse.json({
      data: groups,
      summary: {
        groups: groups.length,
        contacts: groups.reduce((s, g) => s + g.members.length, 0),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
