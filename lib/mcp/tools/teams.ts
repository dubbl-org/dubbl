import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { team, teamMember, member, project, projectTeamAssignment } from "@/lib/db/schema";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { AuthError } from "@/lib/api/auth-context";
import {
  addMemberToTeamProjects,
  addTeamAssignmentMembers,
  releaseTeamAssignmentMembers,
} from "@/lib/api/project-team-members";
import { requireProjectAccess } from "@/lib/api/project-access";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for organization teams: named, colored groups of workspace members
 * that can be assigned to projects. Mirrors /api/v1/teams,
 * /api/v1/teams/[id], /api/v1/teams/[id]/members and
 * /api/v1/projects/[id]/team-assignments.
 *
 * Reads are open to any member; writes need "manage:teams" (team changes) or
 * "manage:projects" plus manage access on the project (project assignments),
 * like the REST routes. Every team,
 * member and project is checked against the caller's organization. Direct DB
 * access via Drizzle; org-scoped via the AuthContext.
 */

const USER_COLUMNS = { id: true, name: true, email: true, image: true } as const;

async function findOrgTeam(ctx: AuthContext, teamId: string) {
  const found = await db.query.team.findFirst({
    where: and(eq(team.id, teamId), eq(team.organizationId, ctx.organizationId)),
  });
  if (!found) throw new AuthError("Team not found", 404);
  return found;
}

async function findOrgProject(ctx: AuthContext, projectId: string) {
  const found = await db.query.project.findFirst({
    where: and(
      eq(project.id, projectId),
      eq(project.organizationId, ctx.organizationId),
      notDeleted(project.deletedAt)
    ),
  });
  if (!found) throw new AuthError("Project not found", 404);
  return found;
}

export function registerTeamTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_teams",
    "List the organization's teams, newest first, with pagination and an optional name search. Each team has id, name, description, color (hex) and members (team member rows with memberId plus the person's name, email and image). Returns { teams, total, page, limit }.",
    {
      search: z.string().optional().describe("Case-insensitive filter on team name"),
      page: z.number().int().min(1).optional().default(1).describe("Page number, starting at 1 (default 1)"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Teams per page, 1-100 (default 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(team.organizationId, ctx.organizationId)];
        if (params.search) conditions.push(ilike(team.name, `%${params.search}%`));

        const teams = await db.query.team.findMany({
          where: and(...conditions),
          orderBy: desc(team.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: {
            members: {
              with: { member: { columns: { id: true }, with: { user: { columns: USER_COLUMNS } } } },
            },
          },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(team)
          .where(and(...conditions));

        return {
          teams: teams.map((t) => ({
            ...t,
            members: t.members.map(({ member: m, ...tm }) => ({
              ...tm,
              name: m.user?.name || null,
              email: m.user?.email || "",
              image: m.user?.image || null,
            })),
          })),
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_team",
    "Get one team by id, including its members (each with the workspace member and their user id, name, email and image). Returns { team }.",
    {
      teamId: z.string().uuid().describe("The UUID of the team"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.team.findFirst({
          where: and(eq(team.id, params.teamId), eq(team.organizationId, ctx.organizationId)),
          with: {
            members: {
              with: { member: { with: { user: { columns: USER_COLUMNS } } } },
            },
          },
        });
        if (!found) throw new AuthError("Team not found", 404);
        return { team: found };
      })
  );

  server.tool(
    "create_team",
    "Create a team. name is required; description and color (hex, default '#3b82f6') are optional. Add people afterwards with add_team_member. Requires the manage:teams permission (admin). Returns { team }.",
    {
      name: z.string().min(1).describe("Team name"),
      description: z.string().nullable().optional().describe("Optional description of what the team does"),
      color: z.string().optional().default("#3b82f6").describe("Hex color used for the team's badge (default '#3b82f6')"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:teams");
        const [created] = await db
          .insert(team)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            description: params.description || null,
            color: params.color,
          })
          .returning();
        return { team: created };
      })
  );

  server.tool(
    "update_team",
    "Update a team's name, description and/or color. Only the fields you pass change. Requires the manage:teams permission (admin). Returns { team }.",
    {
      teamId: z.string().uuid().describe("The UUID of the team to update"),
      name: z.string().min(1).optional().describe("New team name"),
      description: z.string().nullable().optional().describe("New description; pass null to clear it"),
      color: z.string().optional().describe("New hex color"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:teams");
        await findOrgTeam(ctx, params.teamId);

        const changes: { name?: string; description?: string | null; color?: string } = {};
        if (params.name !== undefined) changes.name = params.name;
        if (params.description !== undefined) changes.description = params.description;
        if (params.color !== undefined) changes.color = params.color;

        const [updated] = await db
          .update(team)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(team.id, params.teamId))
          .returning();
        return { team: updated };
      })
  );

  server.tool(
    "delete_team",
    "Permanently delete a team. Its memberships and project assignments are removed, and people who were on a project only through this team are taken off that project. Requires the manage:teams permission (admin). Returns { success: true }.",
    {
      teamId: z.string().uuid().describe("The UUID of the team to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:teams");
        await findOrgTeam(ctx, params.teamId);

        await db.transaction(async (tx) => {
          const assignments = await tx
            .select({ id: projectTeamAssignment.id })
            .from(projectTeamAssignment)
            .where(eq(projectTeamAssignment.teamId, params.teamId));
          await tx.delete(team).where(eq(team.id, params.teamId));
          await releaseTeamAssignmentMembers(tx, assignments.map((a) => a.id));
        });
        return { success: true };
      })
  );

  server.tool(
    "add_team_member",
    "Add a workspace member to a team. memberId is the workspace member id (the id from the members list, not the user id). The person is also added to every project the team is assigned to, with that assignment's role, unless they are already on it. Requires the manage:teams permission (admin). Returns { teamMember }.",
    {
      teamId: z.string().uuid().describe("The UUID of the team"),
      memberId: z.string().uuid().describe("The UUID of the workspace member to add (member id, not user id)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:teams");
        await findOrgTeam(ctx, params.teamId);

        const orgMember = await db.query.member.findFirst({
          where: and(eq(member.id, params.memberId), eq(member.organizationId, ctx.organizationId)),
        });
        if (!orgMember) throw new AuthError("Member not found", 404);

        const existing = await db.query.teamMember.findFirst({
          where: and(eq(teamMember.teamId, params.teamId), eq(teamMember.memberId, params.memberId)),
        });
        if (existing) throw new AuthError("Member is already in this team", 400);

        const created = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(teamMember)
            .values({ teamId: params.teamId, memberId: params.memberId })
            .returning();
          await addMemberToTeamProjects(tx, params.teamId, params.memberId);
          return created;
        });
        return { teamMember: created };
      })
  );

  server.tool(
    "remove_team_member",
    "Remove a workspace member from a team. They are also taken off projects they were on only through this team (people added to a project by hand stay). Requires the manage:teams permission (admin). Returns { success: true }.",
    {
      teamId: z.string().uuid().describe("The UUID of the team"),
      memberId: z.string().uuid().describe("The UUID of the workspace member to remove (member id, not user id)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:teams");
        await findOrgTeam(ctx, params.teamId);

        const existing = await db.query.teamMember.findFirst({
          where: and(eq(teamMember.teamId, params.teamId), eq(teamMember.memberId, params.memberId)),
        });
        if (!existing) throw new AuthError("Team member not found", 404);

        await db.transaction(async (tx) => {
          await tx
            .delete(teamMember)
            .where(and(eq(teamMember.teamId, params.teamId), eq(teamMember.memberId, params.memberId)));
          const assignments = await tx
            .select({ id: projectTeamAssignment.id })
            .from(projectTeamAssignment)
            .where(eq(projectTeamAssignment.teamId, params.teamId));
          await releaseTeamAssignmentMembers(tx, assignments.map((a) => a.id), params.memberId);
        });
        return { success: true };
      })
  );

  server.tool(
    "list_project_team_assignments",
    "List the teams assigned to a project, each with its defaultRole and the team's members (with user name and email). Returns { assignments }.",
    {
      projectId: z.string().uuid().describe("The UUID of the project"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await findOrgProject(ctx, params.projectId);
        const assignments = await db.query.projectTeamAssignment.findMany({
          where: eq(projectTeamAssignment.projectId, params.projectId),
          with: {
            team: {
              with: {
                members: { with: { member: { with: { user: { columns: USER_COLUMNS } } } } },
              },
            },
          },
        });
        return { assignments };
      })
  );

  server.tool(
    "assign_team_to_project",
    "Assign a team to a project. Every person on the team is added as a project member with defaultRole (manager, contributor or viewer; default contributor); people already on the project keep their current role. People who join the team later are added too. Requires the manage:projects permission and manage access on the project (owner, admin, or a project manager; anyone with manage:projects while the project has no manager). Returns { assignment, addedMembers } where addedMembers is how many people were added to the project.",
    {
      projectId: z.string().uuid().describe("The UUID of the project"),
      teamId: z.string().uuid().describe("The UUID of the team to assign"),
      defaultRole: z
        .enum(["manager", "contributor", "viewer"])
        .optional()
        .default("contributor")
        .describe("Project role given to the team's people (default contributor)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await findOrgTeam(ctx, params.teamId);

        const existing = await db.query.projectTeamAssignment.findFirst({
          where: and(
            eq(projectTeamAssignment.projectId, params.projectId),
            eq(projectTeamAssignment.teamId, params.teamId)
          ),
        });
        if (existing) throw new AuthError("Team already assigned to this project", 400);

        return db.transaction(async (tx) => {
          const [assignment] = await tx
            .insert(projectTeamAssignment)
            .values({
              projectId: params.projectId,
              teamId: params.teamId,
              defaultRole: params.defaultRole,
            })
            .returning();
          const addedMembers = await addTeamAssignmentMembers(tx, assignment);
          return { assignment, addedMembers };
        });
      })
  );

  server.tool(
    "unassign_team_from_project",
    "Remove a team from a project. People who were on the project only through this team are taken off it; people added by hand or through another assigned team stay. Requires the manage:projects permission and manage access on the project (owner, admin, or a project manager; anyone with manage:projects while the project has no manager). Returns { success: true }.",
    {
      projectId: z.string().uuid().describe("The UUID of the project"),
      teamId: z.string().uuid().describe("The UUID of the team to remove from the project"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");

        await db.transaction(async (tx) => {
          const removed = await tx
            .delete(projectTeamAssignment)
            .where(
              and(
                eq(projectTeamAssignment.projectId, params.projectId),
                eq(projectTeamAssignment.teamId, params.teamId)
              )
            )
            .returning({ id: projectTeamAssignment.id });
          await releaseTeamAssignmentMembers(tx, removed.map((r) => r.id));
        });
        return { success: true };
      })
  );
}
