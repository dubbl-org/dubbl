import { db } from "@/lib/db";
import { member, project, projectMember } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import {
  accessAtLeast,
  resolveProjectAccess,
  type ProjectAccess,
  type ProjectRole,
} from "@/lib/projects/rules";

export type ProjectRecord = typeof project.$inferSelect;

/**
 * Errors raised by project helpers. They extend AuthError so both handleError
 * (REST) and wrapTool (MCP) pass the message and status through unchanged.
 */
export class ProjectError extends AuthError {}

export class ProjectNotFoundError extends ProjectError {
  constructor(entity = "Project") {
    super(`${entity} not found`, 404);
  }
}

function canManageProjects(ctx: AuthContext): boolean {
  try {
    requireRole(ctx, "manage:projects");
    return true;
  } catch {
    return false;
  }
}

/** The caller's access level on a project (see resolveProjectAccess). */
export async function getProjectAccess(ctx: AuthContext, projectId: string): Promise<ProjectAccess> {
  if (ctx.role === "owner" || ctx.role === "admin") return "manage";
  const canManage = canManageProjects(ctx);
  if (!canManage) return "view";

  const mem = await db.query.member.findFirst({
    where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
    columns: { id: true },
  });
  const pm = mem
    ? await db.query.projectMember.findFirst({
        where: and(eq(projectMember.projectId, projectId), eq(projectMember.memberId, mem.id)),
        columns: { role: true },
      })
    : null;
  const manager = pm
    ? null
    : await db.query.projectMember.findFirst({
        where: and(eq(projectMember.projectId, projectId), eq(projectMember.role, "manager")),
        columns: { id: true },
      });

  return resolveProjectAccess({
    orgRole: ctx.role,
    canManageProjects: canManage,
    projectRole: (pm?.role as ProjectRole | undefined) ?? null,
    projectHasManager: !!manager,
  });
}

/**
 * Load an org-scoped, non-deleted project and check the caller may perform an
 * action needing `needed` access. Throws ProjectNotFoundError (404) or
 * AuthError (403). Viewing only needs org membership, like the rest of the app.
 */
export async function requireProjectAccess(
  ctx: AuthContext,
  projectId: string,
  needed: ProjectAccess
): Promise<{ project: ProjectRecord; access: ProjectAccess }> {
  const found = await db.query.project.findFirst({
    where: and(
      eq(project.id, projectId),
      eq(project.organizationId, ctx.organizationId),
      notDeleted(project.deletedAt)
    ),
  });
  if (!found) throw new ProjectNotFoundError();

  if (needed !== "view") requireRole(ctx, "manage:projects");
  const access = await getProjectAccess(ctx, projectId);
  if (!accessAtLeast(access, needed)) {
    throw new AuthError(
      needed === "manage"
        ? "Only project managers can do this on this project"
        : "You have view-only access to this project",
      403
    );
  }
  return { project: found, access };
}
