import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { revokeMcpConnection } from "@/lib/api/mcp-connections";

/** Disconnect an MCP connection in this organization. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:api-keys");

    const revoked = await revokeMcpConnection(id, {
      organizationId: ctx.organizationId,
    });
    if (!revoked) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logAudit({ ctx, action: "delete", entityType: "mcp_connection", entityId: id, request });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
