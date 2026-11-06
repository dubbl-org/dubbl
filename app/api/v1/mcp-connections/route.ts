import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { listMcpConnections } from "@/lib/api/mcp-connections";

/** Every AI assistant (MCP client) connected to this organization, by any member. */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:api-keys");

    const connections = await listMcpConnections({
      organizationId: ctx.organizationId,
    });
    return NextResponse.json({ connections });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
