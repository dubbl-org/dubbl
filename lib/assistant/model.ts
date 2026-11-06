import type { ModelTool } from "./tools";

/**
 * The stored message format. Conversations are saved as these blocks and only
 * converted to the model provider's format when a request is made.
 */
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

/** A stored message once its file references are expanded into base64 images and PDFs (text files become text). */
export type ApiBlock =
  | ContentBlock
  | { type: "image"; mimeType: string; data: string }
  | { type: "pdf"; fileName: string; data: string };

export interface ApiMessage {
  role: "user" | "assistant";
  content: string | ApiBlock[];
}

export interface ModelTurn {
  content: ContentBlock[];
  /** "tool_use" when the model called tools, "end_turn", "max_tokens", or the provider's own reason. */
  stopReason: string | null;
}

/** OpenRouter's OpenAI-compatible chat API. OPENROUTER_BASE_URL lets a proxy or gateway sit in front of it. */
const API_URL = `${(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`;

export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL || "openai/gpt-6-luna";
const REASONING_EFFORT = process.env.ASSISTANT_REASONING_EFFORT || "medium";
/** Reasoning tokens count toward this too. */
const MAX_TOKENS = 16_384;

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Convert stored messages to OpenAI chat messages. Tool results become `tool`
 * messages placed straight after the assistant turn that made the calls; any
 * text or files sent alongside them follow as a user message.
 */
export function toChatMessages(system: string, messages: ApiMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content });
      continue;
    }

    if (m.role === "assistant") {
      const text = m.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("\n\n");
      const calls: ToolCall[] = m.content.flatMap((b) =>
        b.type === "tool_use"
          ? [{ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }]
          : []
      );
      out.push(calls.length ? { role: "assistant", content: text || null, tool_calls: calls } : { role: "assistant", content: text });
      continue;
    }

    const parts: ChatPart[] = [];
    for (const b of m.content) {
      switch (b.type) {
        case "tool_result":
          out.push({
            role: "tool",
            tool_call_id: b.tool_use_id,
            content: `${b.is_error ? "[Tool error] " : ""}${b.content || "(no output)"}`,
          });
          break;
        case "text":
          if (b.text) parts.push({ type: "text", text: b.text });
          break;
        case "image":
          parts.push({ type: "image_url", image_url: { url: `data:${b.mimeType};base64,${b.data}` } });
          break;
        case "pdf":
          parts.push({ type: "file", file: { filename: b.fileName, file_data: `data:application/pdf;base64,${b.data}` } });
          break;
      }
    }
    if (parts.length) out.push({ role: "user", content: parts });
  }
  return out;
}

const STOP_REASONS: Record<string, string> = { tool_calls: "tool_use", stop: "end_turn", length: "max_tokens" };

interface StreamChunk {
  error?: { message?: string; code?: number | string };
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
}

/** Read an OpenAI-style chat completion stream into stored content blocks, calling `onText` as text arrives. */
export async function readStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<ModelTurn> {
  let text = "";
  const calls: { id: string; name: string; args: string }[] = [];
  let finish: string | null = null;

  const handle = (chunk: StreamChunk) => {
    if (chunk.error) throw new Error(chunk.error.message || "Model stream error");
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      onText(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      const call = (calls[tc.index] ??= { id: "", name: "", args: "" });
      if (tc.id) call.id = tc.id;
      if (tc.function?.name) call.name += tc.function.name;
      if (tc.function?.arguments) call.args += tc.function.arguments;
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  try {
    while (!done) {
      const read = await reader.read();
      if (read.done) {
        buffer += decoder.decode();
        done = true;
      } else {
        buffer += decoder.decode(read.value, { stream: true });
      }
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        // Blank lines end events; lines starting with ":" are keep-alive comments.
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          done = true;
          break;
        }
        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(data) as StreamChunk;
        } catch {
          continue;
        }
        handle(chunk);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const content: ContentBlock[] = [];
  if (text) content.push({ type: "text", text });
  calls.forEach((c, i) => {
    if (!c?.name) return;
    let input: unknown = {};
    try {
      input = c.args.trim() ? JSON.parse(c.args) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: c.id || `call_${Date.now()}_${i}`, name: c.name, input });
  });

  // Some providers report "stop" even when they called tools; the calls are what matter.
  const hasCalls = content.some((b) => b.type === "tool_use");
  const stopReason = hasCalls ? "tool_use" : finish ? (STOP_REASONS[finish] ?? finish) : null;
  return { content, stopReason };
}

/** Stream one model turn through OpenRouter, calling `onText` as text arrives. */
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
  tools: ModelTool[];
  onText: (text: string) => void;
  signal?: AbortSignal;
}): Promise<ModelTurn> {
  const referer = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-Title": "dubbl",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      stream: true,
      max_tokens: MAX_TOKENS,
      messages: toChatMessages(system, messages),
      tools: tools.map((t) => ({ type: "function", function: t })),
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: REASONING_EFFORT },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Model request failed (${res.status}) ${detail.slice(0, 300)}`);
  }

  return readStream(res.body, onText);
}
