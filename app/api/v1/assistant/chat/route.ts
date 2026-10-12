import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { document, organization } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { error, handleError, notFound } from "@/lib/api/response";
import {
  streamTurn,
  type ApiMessage,
  type ContentBlock,
  type FileBlock,
  type StoredBlock,
  type StoredMessage,
} from "@/lib/assistant/anthropic";
import {
  BOOKING_TOOLS,
  CORE_TOOLS,
  centsFields,
  FIND_TOOLS,
  collectTools,
  findTools,
  toAnthropicTool,
  type AssistantTool,
} from "@/lib/assistant/tools";
import { systemPrompt } from "@/lib/assistant/prompt";
import { expandFiles, MAX_FILES_PER_MESSAGE } from "@/lib/assistant/files";
import { createConversation, getConversation, saveConversation, titleFrom } from "@/lib/assistant/conversations";

export const maxDuration = 300;

const MAX_STEPS = 16;
const MAX_HISTORY = 60;

const bodySchema = z
  .object({
    /** Leave out to start a new conversation. */
    conversationId: z.string().uuid().optional(),
    text: z.string().max(20_000).optional(),
    /** Document ids returned by /api/v1/assistant/files. */
    files: z.array(z.string().uuid()).max(MAX_FILES_PER_MESSAGE).optional(),
    approval: z
      .object({
        toolUseId: z.string(),
        decision: z.enum(["approve", "deny"]),
        /** Approve this tool for the rest of the conversation. */
        always: z.boolean().optional(),
      })
      .optional(),
    page: z.string().max(300).optional(),
  })
  .refine((b) => b.approval || b.text?.trim() || b.files?.length, { message: "Send a message, a file or an approval" });

type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResult = Extract<ContentBlock, { type: "tool_result" }>;

const blocksOf = (m: StoredMessage | undefined): StoredBlock[] => (!m || typeof m.content === "string" ? [] : m.content);
const callsOf = (m: StoredMessage | undefined) => blocksOf(m).filter((b): b is ToolUse => b.type === "tool_use");

/** Keep the conversation bounded, cutting only at a plain user message so tool pairs stay intact. */
function trimHistory(messages: StoredMessage[]) {
  if (messages.length <= MAX_HISTORY) return messages;
  for (let i = messages.length - MAX_HISTORY; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user" && blocksOf(m).every((b) => b.type !== "tool_result")) return messages.slice(i);
  }
  return messages;
}

/**
 * A stopped or failed run can leave tool calls without results, which the API
 * rejects. Answer them as "not run", except on the last turn, which may be
 * waiting on this request's approval.
 */
function closeDanglingCalls(messages: StoredMessage[]) {
  const out: StoredMessage[] = [];
  messages.forEach((m, i) => {
    out.push(m);
    if (m.role !== "assistant" || i === messages.length - 1) return;
    const ids = callsOf(m).map((b) => b.id);
    if (ids.length === 0) return;
    const next = messages[i + 1];
    const answered = new Set(blocksOf(next).flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : [])));
    const missing = ids.filter((id) => !answered.has(id));
    if (missing.length === 0) return;
    const results: StoredBlock[] = missing.map((id) => ({ type: "tool_result", tool_use_id: id, content: "This action was not run." }));
    if (next?.role === "user" && typeof next.content !== "string" && answered.size > 0) {
      next.content = [...next.content.filter((b) => b.type === "tool_result"), ...results, ...next.content.filter((b) => b.type !== "tool_result")];
    } else {
      out.push({ role: "user", content: results });
    }
  });
  return out;
}

/** Tools the model has used or discovered stay loaded for the rest of the conversation. */
function loadedToolNames(messages: StoredMessage[]) {
  const names = new Set(CORE_TOOLS);
  const findIds = new Set<string>();
  let hasFiles = false;
  for (const m of messages) {
    for (const b of blocksOf(m)) {
      if (b.type === "file") hasFiles = true;
      if (b.type === "tool_use") {
        if (b.name === "find_tools") findIds.add(b.id);
        else names.add(b.name);
      }
      if (b.type === "tool_result" && findIds.has(b.tool_use_id)) {
        try {
          for (const t of JSON.parse(b.content) as { name: string }[]) names.add(t.name);
        } catch {
          // not a tool list
        }
      }
    }
  }
  if (hasFiles) for (const n of BOOKING_TOOLS) names.add(n);
  return names;
}

/** Lets the panel tell people up front whether Tilly is switched on. */
export async function GET(request: Request) {
  try {
    await getAuthContext(request);
    return Response.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Run Tilly on a conversation and stream what happens as server-sent events:
 * conversation, text_delta, tool_start, tool_result, step, approval_required,
 * state (the saved transcript), error and done. The transcript lives on the
 * server; the browser sends only the new message or an approval decision.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "not_configured", message: "Tilly needs an ANTHROPIC_API_KEY in the server environment." },
        { status: 503 }
      );
    }

    const body = bodySchema.parse(await request.json());
    const text = body.text?.trim() ?? "";

    // Files must be this workspace's and visible to this member; names come from the database.
    const fileRows = body.files?.length
      ? await db
          .select({ id: document.id, fileName: document.fileName, mimeType: document.mimeType, fileSize: document.fileSize })
          .from(document)
          .where(
            and(
              eq(document.organizationId, ctx.organizationId),
              inArray(document.id, body.files),
              notDeleted(document.deletedAt),
              or(eq(document.visibility, "organization"), eq(document.uploadedBy, ctx.userId))
            )
          )
      : [];
    if (fileRows.length !== (body.files?.length ?? 0)) return notFound("File");
    const files: FileBlock[] = fileRows.map((f) => ({ type: "file", documentId: f.id, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.fileSize }));

    let convo = body.conversationId ? await getConversation(ctx.organizationId, ctx.userId, body.conversationId) : undefined;
    if (body.conversationId && !convo) return notFound("Conversation");
    if (!convo) {
      if (body.approval) return error("There is nothing waiting for approval", 409);
      convo = await createConversation(ctx.organizationId, ctx.userId, titleFrom(text, files.map((f) => f.fileName)));
    }

    let messages = (convo.messages ?? []) as StoredMessage[];
    let pendingResults = (convo.pendingResults ?? []) as ToolResult[];
    const pendingCall = convo.pending as { id: string; name: string } | null;
    const autoApprove = new Set(convo.autoApprove ?? []);
    let approval = body.approval;

    if (approval) {
      if (!pendingCall || pendingCall.id !== approval.toolUseId) return error("That action is no longer waiting for approval", 409);
    } else {
      // A new message while something waits for approval skips it and moves on.
      const userBlocks: StoredBlock[] = [...files, ...(text ? [{ type: "text" as const, text }] : [])];
      const open = messages[messages.length - 1]?.role === "assistant" ? callsOf(messages[messages.length - 1]) : [];
      if (open.length) {
        const done = new Set(pendingResults.map((r) => r.tool_use_id));
        const skipped: ToolResult[] = open
          .filter((c) => !done.has(c.id))
          .map((c) => ({
            type: "tool_result",
            tool_use_id: c.id,
            content: c.id === pendingCall?.id ? "The user moved on without approving this action. Do not retry it unless they ask." : "This action was not run.",
          }));
        messages = [...messages, { role: "user", content: [...pendingResults, ...skipped, ...userBlocks] }];
      } else {
        messages = [...messages, { role: "user", content: userBlocks }];
      }
      pendingResults = [];
    }

    messages = closeDanglingCalls(trimHistory(messages));
    if (approval?.always && approval.decision === "approve" && pendingCall) autoApprove.add(pendingCall.name);

    const tools = collectTools(ctx);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { name: true, defaultCurrency: true },
    });
    const system = systemPrompt({
      orgName: org?.name ?? "this workspace",
      currency: org?.defaultCurrency ?? "USD",
      page: body.page,
      today: new Date().toISOString().slice(0, 10),
    });

    const convoId = convo.id;
    const title = convo.title;
    let pending: Record<string, unknown> | null = null;
    let saved = false;
    const persist = () =>
      saveConversation(ctx.organizationId, ctx.userId, convoId, {
        messages,
        pendingResults,
        pending,
        autoApprove: [...autoApprove],
      });

    // Save the new message right away, so it survives a closed tab.
    await saveConversation(ctx.organizationId, ctx.userId, convoId, { messages, pendingResults, pending: approval ? convo.pending : null });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const emit = (event: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            closed = true;
          }
        };
        const state = () => emit({ type: "state", messages, pendingResults, pending, autoApprove: [...autoApprove] });

        emit({ type: "conversation", id: convoId, title });

        let api: ApiMessage[] = [];

        /** Run the tool calls of the last assistant turn. Returns false if paused for approval. */
        const runToolCalls = async (): Promise<boolean> => {
          const results = pendingResults;
          for (const call of callsOf(messages[messages.length - 1])) {
            if (results.some((r) => r.tool_use_id === call.id)) continue;

            if (call.name === "find_tools") {
              const query = String((call.input as { query?: string })?.query ?? "");
              emit({ type: "tool_start", id: call.id, name: call.name, input: call.input });
              results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(findTools(tools, query)) });
              emit({ type: "tool_result", id: call.id, ok: true });
              continue;
            }

            const tool: AssistantTool | undefined = tools.get(call.name);
            if (!tool) {
              results.push({ type: "tool_result", tool_use_id: call.id, content: `Unknown tool ${call.name}`, is_error: true });
              continue;
            }

            const trusted = tool.risk === "write" && autoApprove.has(tool.name);
            if (tool.risk !== "read" && !trusted) {
              if (approval?.toolUseId !== call.id) {
                pending = { id: call.id, name: call.name, input: call.input, risk: tool.risk, cents: centsFields(tool) };
                await persist();
                saved = true;
                state();
                emit({ type: "approval_required", ...pending });
                return false;
              }
              if (approval.decision === "deny") {
                results.push({
                  type: "tool_result",
                  tool_use_id: call.id,
                  content: "The user chose to skip this action. Do not retry it unless they ask.",
                });
                emit({ type: "tool_result", id: call.id, ok: false, skipped: true });
                approval = undefined;
                continue;
              }
              approval = undefined;
            }

            emit({ type: "tool_start", id: call.id, name: call.name, input: call.input });
            const out = await tool.run(call.input).catch((err: unknown) => ({
              text: JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" }),
              isError: true,
            }));
            results.push({ type: "tool_result", tool_use_id: call.id, content: out.text, ...(out.isError ? { is_error: true } : {}) });
            emit({ type: "tool_result", id: call.id, ok: !out.isError, ...(trusted ? { auto: true } : {}) });
          }

          const resultsMessage: StoredMessage = { role: "user", content: results };
          messages.push(resultsMessage);
          api.push(resultsMessage as ApiMessage);
          pendingResults = [];
          return true;
        };

        try {
          api = await expandFiles(messages, ctx.organizationId);
          for (let step = 0; step < MAX_STEPS; step++) {
            const last = messages[messages.length - 1];
            if (last.role === "assistant" && callsOf(last).length && !(await runToolCalls())) {
              emit({ type: "done", awaitingApproval: true });
              return;
            }

            const loaded = loadedToolNames(messages);
            const turn = await streamTurn({
              apiKey,
              system,
              messages: api,
              tools: [FIND_TOOLS, ...[...loaded].flatMap((n) => (tools.has(n) ? [toAnthropicTool(tools.get(n)!)] : []))],
              onText: (t) => emit({ type: "text_delta", text: t }),
              signal: request.signal,
            });
            if (turn.content.length === 0) break;
            const reply: StoredMessage = { role: "assistant", content: turn.content };
            messages.push(reply);
            api.push(reply as ApiMessage);
            if (turn.stopReason !== "tool_use") break;
            emit({ type: "step" });
          }

          await persist();
          saved = true;
          state();
          emit({ type: "done" });
        } catch (err) {
          if (!request.signal.aborted) {
            console.error("Assistant error:", err);
            emit({ type: "error", message: "Tilly hit a snag. Please try again." });
          }
        } finally {
          // A stopped or failed run keeps everything that happened before it stopped.
          if (!saved) {
            await persist().catch((e) => console.error("Assistant save failed:", e));
            state();
          }
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
