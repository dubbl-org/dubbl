import { db } from "@/lib/db";
import {
  mcpAccessToken,
  mcpRefreshToken,
  mcpOAuthClient,
  organization,
  users,
} from "@/lib/db/schema";
import { and, eq, gt, or, type SQL } from "drizzle-orm";

/**
 * One AI assistant (MCP client) connected by one user to one organization.
 * Its id is the newest access token row of that connection.
 */
export interface McpConnection {
  id: string;
  clientName: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  authorizedAt: string;
  expiresAt: string;
}

/** Live MCP connections, filtered to one user and/or one organization. */
export async function listMcpConnections(filter: {
  userId?: string;
  organizationId?: string;
}): Promise<McpConnection[]> {
  const now = new Date();
  const conditions: SQL[] = [];
  if (filter.userId) conditions.push(eq(mcpAccessToken.userId, filter.userId));
  if (filter.organizationId) {
    conditions.push(eq(mcpAccessToken.organizationId, filter.organizationId));
  }

  const rows = await db
    .select({
      id: mcpAccessToken.id,
      clientId: mcpAccessToken.clientId,
      clientName: mcpOAuthClient.clientName,
      organizationId: mcpAccessToken.organizationId,
      organizationName: organization.name,
      userId: mcpAccessToken.userId,
      userName: users.name,
      userEmail: users.email,
      createdAt: mcpAccessToken.createdAt,
      accessExpiresAt: mcpAccessToken.expiresAt,
      refreshExpiresAt: mcpRefreshToken.expiresAt,
    })
    .from(mcpAccessToken)
    .innerJoin(organization, eq(organization.id, mcpAccessToken.organizationId))
    .innerJoin(users, eq(users.id, mcpAccessToken.userId))
    .leftJoin(mcpOAuthClient, eq(mcpOAuthClient.clientId, mcpAccessToken.clientId))
    .leftJoin(mcpRefreshToken, eq(mcpRefreshToken.accessTokenId, mcpAccessToken.id))
    .where(
      and(
        ...conditions,
        or(gt(mcpAccessToken.expiresAt, now), gt(mcpRefreshToken.expiresAt, now))
      )
    );

  // Newest row first: it names the connection, older rows only extend expiry
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const byConnection = new Map<string, McpConnection>();
  for (const r of rows) {
    const key = `${r.userId}:${r.organizationId}:${r.clientId}`;
    const expires =
      r.refreshExpiresAt && r.refreshExpiresAt > r.accessExpiresAt
        ? r.refreshExpiresAt
        : r.accessExpiresAt;
    const existing = byConnection.get(key);
    if (existing) {
      if (expires.toISOString() > existing.expiresAt) {
        existing.expiresAt = expires.toISOString();
      }
      continue;
    }
    byConnection.set(key, {
      id: r.id,
      clientName: r.clientName || "MCP client",
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      authorizedAt: r.createdAt.toISOString(),
      expiresAt: expires.toISOString(),
    });
  }

  return [...byConnection.values()];
}

/**
 * Disconnect an MCP client: deletes every token of that connection (refresh
 * tokens cascade). Scoped to a user or an organization so callers can only
 * revoke what they can see. Returns false when nothing matched.
 */
export async function revokeMcpConnection(
  id: string,
  scope: { userId?: string; organizationId?: string }
): Promise<boolean> {
  const conditions: SQL[] = [eq(mcpAccessToken.id, id)];
  if (scope.userId) conditions.push(eq(mcpAccessToken.userId, scope.userId));
  if (scope.organizationId) {
    conditions.push(eq(mcpAccessToken.organizationId, scope.organizationId));
  }

  const token = await db.query.mcpAccessToken.findFirst({
    where: and(...conditions),
  });
  if (!token) return false;

  await db
    .delete(mcpAccessToken)
    .where(
      and(
        eq(mcpAccessToken.userId, token.userId),
        eq(mcpAccessToken.organizationId, token.organizationId),
        eq(mcpAccessToken.clientId, token.clientId)
      )
    );
  return true;
}
