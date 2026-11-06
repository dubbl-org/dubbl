import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError } from "@/lib/api/response";
import { computeCrmAnalytics } from "@/lib/api/crm-deals";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok(await computeCrmAnalytics(ctx));
  } catch (err) {
    return handleError(err);
  }
}
