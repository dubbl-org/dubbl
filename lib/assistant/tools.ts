import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/api/auth-context";
import { registerAllTools } from "@/lib/mcp/tools";

/** read runs on its own; write and send always wait for the user's approval. */
export type Risk = "read" | "write" | "send";

export interface AssistantTool {
  name: string;
  description: string;
  risk: Risk;
  shape: z.ZodRawShape;
  run: (input: unknown) => Promise<{ text: string; isError: boolean }>;
}

/** A tool as offered to the model: a name, a description and a JSON Schema for its input. */
export interface ModelTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type McpResult = { content: { type: string; text?: string }[]; isError?: boolean };

const READ_PREFIX = /^(list|get|check|resolve|search)_/;
const READ_NAMES = new Set([
  "convert_amount",
  "budget_vs_actual",
  "reconciliation_report",
  "trial_balance",
  "balance_sheet",
  "profit_and_loss",
  "aged_receivables",
  "aged_payables",
  "stripe_fee_report",
  "cash_flow_statement",
  "tracking_category_report",
  "executive_summary",
  "sales_by_customer",
  "sales_by_item",
  "report_1099",
]);
const SEND_NAMES = /^(send|resend|bulk_send)_|^(request_invoice_signature|send_payment_batch_remittance|trigger_report_schedule|process_reminders)$/;

export function riskOf(name: string): Risk {
  if (SEND_NAMES.test(name)) return "send";
  if (READ_PREFIX.test(name) || READ_NAMES.has(name)) return "read";
  return "write";
}

/** Always available, so everyday questions need no tool search first. */
export const CORE_TOOLS = [
  "get_organization",
  "list_invoices",
  "get_invoice",
  "list_bills",
  "list_contacts",
  "get_contact",
  "list_payments",
  "list_bank_transactions",
  "list_accounts",
  "list_entries",
  "profit_and_loss",
  "balance_sheet",
  "cash_flow_statement",
  "aged_receivables",
  "aged_payables",
  "executive_summary",
  "search_everything",
];

/** Loaded once a file is in the conversation, so a receipt can be booked without a tool search. */
export const BOOKING_TOOLS = [
  "link_document_to_record",
  "create_bill",
  "create_contact",
  "create_expense_claim",
  "list_tax_rates",
  "categorize_bank_transaction",
  "match_to_bill",
  "import_csv_data",
];

/** Chat history tools exist for MCP clients; Tilly has no use for them. */
const HIDDEN = /_assistant_conversations?$/;

const MAX_RESULT_CHARS = 12_000;

/**
 * Collect the MCP tool registry in-process, bound to this member's context,
 * so the assistant runs exactly what the MCP server exposes.
 */
export function collectTools(ctx: AuthContext): Map<string, AssistantTool> {
  const tools = new Map<string, AssistantTool>();

  const collector = {
    tool: (...args: unknown[]) => {
      const name = args[0] as string;
      if (HIDDEN.test(name)) return;
      const description = typeof args[1] === "string" ? args[1] : "";
      const handler = args[args.length - 1] as (params: unknown) => Promise<McpResult>;
      const shape =
        (args.slice(1, -1).find((a) => a !== null && typeof a === "object") as z.ZodRawShape | undefined) ?? {};
      const schema = z.object(shape);

      tools.set(name, {
        name,
        description,
        risk: riskOf(name),
        shape,
        run: async (input) => {
          const parsed = schema.safeParse(input ?? {});
          if (!parsed.success) {
            return {
              text: JSON.stringify({ error: "Invalid input", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }),
              isError: true,
            };
          }
          const result = await handler(parsed.data);
          const text = result.content.map((c) => c.text ?? "").join("\n");
          return {
            text: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)` : text,
            isError: Boolean(result.isError),
          };
        },
      });
    },
  } as unknown as McpServer;

  registerAllTools(collector, ctx);
  return tools;
}

export function toModelTool(tool: AssistantTool): ModelTool {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(z.object(tool.shape), { io: "input" }) as Record<string, unknown>;
  void _ignored;
  return { name: tool.name, description: tool.description, parameters: schema };
}

export const FIND_TOOLS: ModelTool = {
  name: "find_tools",
  description:
    "Search dubbl's full set of tools by keyword when none of your loaded tools fit (e.g. 'reminder', 'budget', 'payroll run', 'credit note'). Matching tools become available on your next step. Returns name, description and whether each tool needs the user's approval.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "A few keywords describing what you want to do" },
    },
    required: ["query"],
  },
};

export function findTools(tools: Map<string, AssistantTool>, query: string, limit = 12) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  return [...tools.values()]
    .map((t) => {
      const name = t.name.replace(/_/g, " ");
      const desc = t.description.toLowerCase();
      const score = words.reduce(
        (s, w) => s + (name.includes(w) ? 3 : 0) + (desc.includes(w) ? 1 : 0) + (name.includes(w.replace(/s$/, "")) ? 1 : 0),
        0
      );
      return { t, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => ({ name: t.name, description: t.description, needsApproval: t.risk !== "read" }));
}

/** Input fields whose description says they take integer cents, at any depth, so approvals show real money. */
export function centsFields(tool: AssistantTool): string[] {
  const found = new Set<string>();
  const walk = (node: unknown, key?: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as { description?: string; properties?: Record<string, unknown>; items?: unknown; anyOf?: unknown[] };
    if (key && n.description && /\bcents?\b/i.test(n.description)) found.add(key);
    for (const [k, v] of Object.entries(n.properties ?? {})) walk(v, k);
    if (n.items) walk(n.items, key);
    for (const v of n.anyOf ?? []) walk(v, key);
  };
  walk(toModelTool(tool).parameters);
  return [...found];
}
