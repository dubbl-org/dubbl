import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/api/auth-context";
import { registerAllTools } from "./tools";

export function createMcpServer(ctx: AuthContext): McpServer {
  const server = new McpServer({
    name: "dubbl",
    version: "0.1.0",
  });

  registerAllTools(server, ctx);

  return server;
}
