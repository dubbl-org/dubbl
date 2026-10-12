import type { AnthropicTool } from "./tools";

/** The subset of the Messages API this assistant uses. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/** An uploaded file, stored in a conversation as a reference to its document row. */
export interface FileBlock {
  type: "file";
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export type StoredBlock = ContentBlock | FileBlock;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string | StoredBlock[];
}

/** What is sent to the API once files are expanded into image and document blocks. */
export type ApiBlock =
  | ContentBlock
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string }
  | { type: "document"; source: { type: "text"; media_type: "text/plain"; data: string }; title?: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ApiMessage {
  role: "user" | "assistant";
  content: string | (ApiBlock & { cache_control?: { type: "ephemeral" } })[];
}

export interface ModelTurn {
  content: ContentBlock[];
  stopReason: string | null;
}

/** ANTHROPIC_BASE_URL lets a proxy or gateway sit in front of the API. */
const API_URL = `${(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;

export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "claude-sonnet-5-5";

/** Stream one model turn, calling `onText` as text arrives. */
export async function streamTurn({
  apiKey,
  system,
  messages,
  tools,
  onText,
  signal,
}: {
  apiKey: string;
  system: string;
  messages: ApiMessage[];
  tools: AnthropicTool[];
  onText: (text: string) => void;
  signal?: AbortSignal;
}): Promise<ModelTurn> {
  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      max_tokens: 8192,
      // Cache the tools and instructions, and the conversation so far, so each
      // step of a run (and each file re-read) costs a fraction of the first.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: withCacheBreakpoint(messages),
      tools,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Model request failed (${res.status}) ${detail.slice(0, 300)}`);
  }

  const blocks: (ContentBlock & { partialJson?: string })[] = [];
  let stopReason: string | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handle = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "content_block_start": {
        const block = event.content_block as ContentBlock;
        blocks[event.index as number] =
          block.type === "tool_use" ? { ...block, input: {}, partialJson: "" } : { ...block };
        break;
      }
      case "content_block_delta": {
        const block = blocks[event.index as number];
        const delta = event.delta as { type: string; text?: string; partial_json?: string };
        if (block?.type === "text" && delta.type === "text_delta" && delta.text) {
          block.text += delta.text;
          onText(delta.text);
        } else if (block?.type === "tool_use" && delta.type === "input_json_delta") {
          block.partialJson = (block.partialJson ?? "") + (delta.partial_json ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const block = blocks[event.index as number];
        if (block?.type === "tool_use") {
          block.input = block.partialJson ? JSON.parse(block.partialJson) : {};
          delete block.partialJson;
        }
        break;
      }
      case "message_delta":
        stopReason = ((event.delta as { stop_reason?: string }).stop_reason) ?? stopReason;
        break;
      case "error":
        throw new Error((event.error as { message?: string })?.message || "Model stream error");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) handle(JSON.parse(line.slice(6)));
      }
    }
  }

  // Drop empty text blocks: the API rejects them when sent back.
  const content = blocks.filter((b) => b && !(b.type === "text" && !b.text)) as ContentBlock[];
  return { content, stopReason };
}

/** Mark the end of the conversation as a cache breakpoint. */
function withCacheBreakpoint(messages: ApiMessage[]): ApiMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
  if (blocks.length === 0) return messages;
  const marked = [...blocks.slice(0, -1), { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" as const } }];
  return [...messages.slice(0, -1), { ...last, content: marked }];
}
