import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wrapTool } from "@/lib/mcp/errors";
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  transcriptText,
} from "@/lib/assistant/conversations";
import type { StoredMessage } from "@/lib/assistant/model";
import type { AuthContext } from "@/lib/api/auth-context";

/** Tilly's chat history. These are left out of Tilly's own toolset. */
export function registerAssistantTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_assistant_conversations",
    "List your conversations with Tilly, dubbl's built-in assistant, newest first. Returns id, title, whether it is waiting for an approval, and created/updated timestamps.",
    {
      limit: z.number().int().min(1).max(200).optional().default(50).describe("How many conversations to return (1-200)"),
    },
    (params) =>
      wrapTool(ctx, async () => ({
        conversations: await listConversations(ctx.organizationId, ctx.userId, params.limit),
      }))
  );

  server.tool(
    "get_assistant_conversation",
    "Read one of your Tilly conversations as plain text turns (role and text). Tool calls and file contents are left out; uploaded files appear as [file: name].",
    {
      conversationId: z.string().uuid().describe("UUID of the conversation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const convo = await getConversation(ctx.organizationId, ctx.userId, params.conversationId);
        if (!convo) throw new Error("Conversation not found");
        return {
          id: convo.id,
          title: convo.title,
          createdAt: convo.createdAt,
          updatedAt: convo.updatedAt,
          waitingForApproval: convo.pending != null,
          turns: transcriptText(convo.messages as StoredMessage[]),
        };
      })
  );

  server.tool(
    "rename_assistant_conversation",
    "Rename one of your Tilly conversations. Returns the id and new title.",
    {
      conversationId: z.string().uuid().describe("UUID of the conversation"),
      title: z.string().trim().min(1).max(120).describe("The new title"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const row = await renameConversation(ctx.organizationId, ctx.userId, params.conversationId, params.title);
        if (!row) throw new Error("Conversation not found");
        return row;
      })
  );

  server.tool(
    "delete_assistant_conversation",
    "Permanently delete one of your Tilly conversations. Uploaded files stay in Documents. Returns { deleted: true }.",
    {
      conversationId: z.string().uuid().describe("UUID of the conversation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        if (!(await deleteConversation(ctx.organizationId, ctx.userId, params.conversationId))) {
          throw new Error("Conversation not found");
        }
        return { deleted: true };
      })
  );
}
