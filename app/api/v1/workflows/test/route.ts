import { getAuthContext } from "@/lib/api/auth-context";
import { ok, handleError } from "@/lib/api/response";
import { testWorkflow } from "@/lib/workflows/engine";
import { z } from "zod";

const testSchema = z.object({
  conditions: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains"]),
      value: z.string(),
    }),
  ),
  sampleData: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  try {
    await getAuthContext(request);
    const body = await request.json();
    const parsed = testSchema.parse(body);

    const result = testWorkflow(parsed.conditions, parsed.sampleData);

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
