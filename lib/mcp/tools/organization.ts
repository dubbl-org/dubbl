import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerOrganizationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_organization",
    "Get the current organization's details including name, currency, country, and settings",
    {},
    () =>
      wrapTool(ctx, async () => {
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });
        if (!org) throw new Error("Organization not found");
        return { organization: org };
      })
  );
}
