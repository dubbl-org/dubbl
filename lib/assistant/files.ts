import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { getObjectBytes } from "@/lib/s3";
import type { ApiBlock, ApiMessage, FileBlock, StoredMessage } from "./anthropic";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const TEXT_TYPES = ["text/csv", "text/plain", "application/json", "text/tab-separated-values"];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, "application/pdf", ...TEXT_TYPES];

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 8;

/** Only the newest files are re-read on each turn; older ones become a short note. */
const MAX_FILES_IN_CONTEXT = 8;
const MAX_TEXT_CHARS = 120_000;

/** Browsers and OSes disagree on CSV types; settle on one per extension. */
export function normaliseType(fileName: string, type: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "text/csv";
  if (ext === "tsv") return "text/tab-separated-values";
  if (ext === "txt") return "text/plain";
  if (ext === "json") return "application/json";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return type || "application/octet-stream";
}

const note = (f: FileBlock) =>
  `[Uploaded file "${f.fileName}" (${f.mimeType}), document id ${f.documentId}. Link it to the record you book with link_document_to_record.]`;

/**
 * Turn stored file references into blocks the model can read: images and PDFs
 * as base64, spreadsheets and text inline. Bytes are fetched from storage on
 * each request and never kept in the conversation.
 */
export async function expandFiles(messages: StoredMessage[], orgId: string): Promise<ApiMessage[]> {
  const refs = messages.flatMap((m) => (typeof m.content === "string" ? [] : m.content.filter((b): b is FileBlock => b.type === "file")));
  const keep = new Set(refs.slice(-MAX_FILES_IN_CONTEXT).map((f) => f.documentId));

  const docs = keep.size
    ? await db
        .select({ id: document.id, fileKey: document.fileKey })
        .from(document)
        .where(and(eq(document.organizationId, orgId), inArray(document.id, [...keep])))
    : [];
  const keyOf = new Map(docs.map((d) => [d.id, d.fileKey]));

  const bytes = new Map<string, Uint8Array | null>();
  await Promise.all(
    [...keep].map(async (id) => {
      const key = keyOf.get(id);
      bytes.set(id, key ? await getObjectBytes(key).catch(() => null) : null);
    })
  );

  const expand = (f: FileBlock): ApiBlock[] => {
    const data = keep.has(f.documentId) ? bytes.get(f.documentId) : undefined;
    if (data === undefined) return [{ type: "text", text: `${note(f)} (Shown earlier in this chat; its contents are no longer attached.)` }];
    if (data === null) return [{ type: "text", text: `${note(f)} (The file could not be read from storage.)` }];
    if (IMAGE_TYPES.includes(f.mimeType)) {
      return [
        { type: "text", text: note(f) },
        { type: "image", source: { type: "base64", media_type: f.mimeType, data: Buffer.from(data).toString("base64") } },
      ];
    }
    if (f.mimeType === "application/pdf") {
      return [
        { type: "text", text: note(f) },
        { type: "document", title: f.fileName, source: { type: "base64", media_type: "application/pdf", data: Buffer.from(data).toString("base64") } },
      ];
    }
    let text = new TextDecoder().decode(data);
    if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n… (file truncated)`;
    return [
      { type: "text", text: note(f) },
      { type: "document", title: f.fileName, source: { type: "text", media_type: "text/plain", data: text || "(empty file)" } },
    ];
  };

  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    return { role: m.role, content: m.content.flatMap((b) => (b.type === "file" ? expand(b) : [b])) };
  });
}
