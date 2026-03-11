import { z } from "zod";
import { AuthError } from "@/lib/api/auth-context";
import type { AuthContext } from "@/lib/api/auth-context";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function wrapTool<T>(
  ctx: AuthContext,
  handler: (ctx: AuthContext) => Promise<T>
): Promise<ToolResult> {
  return handler(ctx)
    .then((result) => ({
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    }))
    .catch((err) => {
      if (err instanceof AuthError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: err.status }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof z.ZodError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Validation error",
                details: err.issues.map((i) => i.message),
              }),
            },
          ],
          isError: true,
        };
      }
      console.error("MCP tool error:", err);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "Internal error" }) },
        ],
        isError: true,
      };
    });
}
