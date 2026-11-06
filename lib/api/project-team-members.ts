import { db } from "@/lib/db";
import { projectMember, projectTeamAssignment, teamMember } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

type ProjectMemberRole = "manager" | "contributor" | "viewer";

interface TeamAssignmentRef {
  id: string;
  projectId: string;
  teamId: string;
  defaultRole: ProjectMemberRole;
}

/**
 * Assigning an org team to a project gives its people access by adding them as
 * project members with the assignment's default role. Rows added this way carry
 * `teamAssignmentId`, so they can be taken away again when the team is
 * unassigned or the person leaves the team. People already on the project
 * (added by hand or by another team) are left as they are.
 *
 * Pass `memberIds` to add only those team members (e.g. someone who just joined
 * the team). Returns how many people were added.
 */
export async function addTeamAssignmentMembers(
  tx: DbOrTx,
  assignment: TeamAssignmentRef,
  memberIds?: string[]
): Promise<number> {
  const ids =
    memberIds ??
    (
      await tx
        .select({ memberId: teamMember.memberId })
        .from(teamMember)
        .where(eq(teamMember.teamId, assignment.teamId))
    ).map((r) => r.memberId);
  if (ids.length === 0) return 0;

  const existing = await tx
    .select({ memberId: projectMember.memberId })
    .from(projectMember)
    .where(
      and(
        eq(projectMember.projectId, assignment.projectId),
        inArray(projectMember.memberId, ids)
      )
    );
  const onProject = new Set(existing.map((r) => r.memberId));
  const toAdd = ids.filter((id) => !onProject.has(id));
  if (toAdd.length === 0) return 0;

  await tx.insert(projectMember).values(
    toAdd.map((memberId) => ({
      projectId: assignment.projectId,
      memberId,
      role: assignment.defaultRole,
      teamAssignmentId: assignment.id,
    }))
  );
  return toAdd.length;
}

/** Someone joined a team: add them to every project the team is assigned to. */
export async function addMemberToTeamProjects(tx: DbOrTx, teamId: string, memberId: string) {
  const assignments = await tx
    .select()
    .from(projectTeamAssignment)
    .where(eq(projectTeamAssignment.teamId, teamId));
  for (const a of assignments) {
    await addTeamAssignmentMembers(tx, a, [memberId]);
  }
}

/**
 * Call AFTER a team assignment, a team, or a team membership is deleted.
 * Project members that were added through any of `assignmentIds` (optionally
 * only `memberId`) lose their access, unless another team still assigned to
 * the same project includes them, in which case they stay and are re-linked to
 * that assignment. People added by hand are never touched.
 */
export async function releaseTeamAssignmentMembers(
  tx: DbOrTx,
  assignmentIds: string[],
  memberId?: string
) {
  if (assignmentIds.length === 0) return;

  const rows = await tx
    .select({
      id: projectMember.id,
      projectId: projectMember.projectId,
      memberId: projectMember.memberId,
    })
    .from(projectMember)
    .where(
      and(
        inArray(projectMember.teamAssignmentId, assignmentIds),
        memberId ? eq(projectMember.memberId, memberId) : undefined
      )
    );

  for (const row of rows) {
    const [other] = await tx
      .select({ id: projectTeamAssignment.id })
      .from(projectTeamAssignment)
      .innerJoin(teamMember, eq(teamMember.teamId, projectTeamAssignment.teamId))
      .where(
        and(
          eq(projectTeamAssignment.projectId, row.projectId),
          eq(teamMember.memberId, row.memberId)
        )
      )
      .limit(1);

    if (other) {
      await tx
        .update(projectMember)
        .set({ teamAssignmentId: other.id })
        .where(eq(projectMember.id, row.id));
    } else {
      await tx.delete(projectMember).where(eq(projectMember.id, row.id));
    }
  }
}
