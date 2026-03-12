import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/api/auth-context";
import { registerOrganizationTools } from "./organization";
import { registerAccountTools } from "./accounts";
import { registerEntryTools } from "./entries";
import { registerContactTools } from "./contacts";
import { registerInvoiceTools } from "./invoices";
import { registerBillTools } from "./bills";
import { registerReportTools } from "./reports";
import { registerNotificationTools } from "./notifications";
import { registerRoleTools } from "./roles";

export function registerAllTools(server: McpServer, ctx: AuthContext) {
  registerOrganizationTools(server, ctx);
  registerAccountTools(server, ctx);
  registerEntryTools(server, ctx);
  registerContactTools(server, ctx);
  registerInvoiceTools(server, ctx);
  registerBillTools(server, ctx);
  registerReportTools(server, ctx);
  registerNotificationTools(server, ctx);
  registerRoleTools(server, ctx);
}
