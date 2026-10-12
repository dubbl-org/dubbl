import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError, validationError } from "@/lib/api/response";
import { LINKABLE, searchRecords, type LinkableType } from "@/lib/documents/records";

/**
 * Records a file could be attached to: `type` is one of invoice, bill, quote,
 * expense, payment, journal_entry, bank_transaction or contact, and `search`
 * matches number, name or description. Returns up to 20 `{ id, label, sub,
 * amount (cents), currency, date }`, newest first.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "";
    if (!(LINKABLE as readonly string[]).includes(type)) return validationError(`type must be one of ${LINKABLE.join(", ")}`);
    const options = await searchRecords(ctx.organizationId, type as LinkableType, url.searchParams.get("search") ?? "");
    return ok({ options });
  } catch (err) {
    return handleError(err);
  }
}
