import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantConversation } from "@/lib/db/schema";
import type { StoredMessage } from "./model";

export type Conversation = typeof assistantConversation.$inferSelect;

/** Conversations are private to the member who started them. */
const owned = (orgId: string, userId: string, id: string) =>
  and(eq(assistantConversation.id, id), eq(assistantConversation.organizationId, orgId), eq(assistantConversation.userId, userId));

export function getConversation(orgId: string, userId: string, id: string) {
  return db.query.assistantConversation.findFirst({ where: owned(orgId, userId, id) });
}

export async function listConversations(orgId: string, userId: string, limit = 100) {
  const rows = await db
    .select({
      id: assistantConversation.id,
      title: assistantConversation.title,
      pending: assistantConversation.pending,
      createdAt: assistantConversation.createdAt,
      updatedAt: assistantConversation.updatedAt,
    })
    .from(assistantConversation)
    .where(and(eq(assistantConversation.organizationId, orgId), eq(assistantConversation.userId, userId)))
    .orderBy(desc(assistantConversation.updatedAt))
    .limit(limit);
  return rows.map(({ pending, ...r }) => ({ ...r, waiting: pending != null }));
}

export async function createConversation(orgId: string, userId: string, title: string) {
  const [row] = await db
    .insert(assistantConversation)
    .values({ organizationId: orgId, userId, title })
    .returning();
  return row;
}

export async function saveConversation(
  orgId: string,
  userId: string,
  id: string,
  patch: Partial<Pick<Conversation, "messages" | "pendingResults" | "pending" | "autoApprove" | "title">>
) {
  await db
    .update(assistantConversation)
    .set({ ...patch, updatedAt: new Date() })
    .where(owned(orgId, userId, id));
}

export async function renameConversation(orgId: string, userId: string, id: string, title: string) {
  const [row] = await db
    .update(assistantConversation)
    .set({ title })
    .where(owned(orgId, userId, id))
    .returning({ id: assistantConversation.id, title: assistantConversation.title });
  return row ?? null;
}

export async function deleteConversation(orgId: string, userId: string, id: string) {
  const rows = await db.delete(assistantConversation).where(owned(orgId, userId, id)).returning({ id: assistantConversation.id });
  return rows.length > 0;
}

export async function clearConversations(orgId: string, userId: string) {
  const rows = await db
    .delete(assistantConversation)
    .where(and(eq(assistantConversation.organizationId, orgId), eq(assistantConversation.userId, userId)))
    .returning({ id: assistantConversation.id });
  return rows.length;
}

/** A short title from the first question, or the first file's name. */
export function titleFrom(text: string, fileNames: string[]) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean) return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
  if (fileNames.length) return fileNames.length === 1 ? `Read ${fileNames[0]}` : `Read ${fileNames.length} files`;
  return "New chat";
}

/** The plain text of a stored conversation, for MCP and previews. */
export function transcriptText(messages: StoredMessage[]) {
  return messages.flatMap((m) => {
    if (typeof m.content === "string") return [{ role: m.role, text: m.content }];
    const text = m.content
      .flatMap((b) => (b.type === "text" ? [b.text] : b.type === "file" ? [`[file: ${b.fileName}]`] : []))
      .join("\n");
    return text ? [{ role: m.role, text }] : [];
  });
}
