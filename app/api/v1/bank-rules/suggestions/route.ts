import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getBankRuleSuggestions } from "@/lib/api/bank-rules";

// Suggest bank rules from descriptions the user has categorized to the same
// account at least twice, leaving out anything an active rule already matches.
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const suggestions = await getBankRuleSuggestions(ctx.organizationId);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return handleError(err);
  }
}
