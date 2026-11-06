import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/api/app-auth";
import { revokeMcpConnection } from "@/lib/api/mcp-connections";

/** Disconnect one of the signed-in user's MCP connections. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    const revoked = await revokeMcpConnection(id, { userId });
    if (!revoked) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
