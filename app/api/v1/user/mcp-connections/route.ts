import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/api/app-auth";
import { listMcpConnections } from "@/lib/api/mcp-connections";

/** AI assistants (MCP clients) the signed-in user connected, in any organization. */
export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const connections = await listMcpConnections({ userId });
    return NextResponse.json({ connections });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
