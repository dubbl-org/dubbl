import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * One project with every relation its tabs need, mirroring GET /api/v1/projects/[id].
 *
 * The project layout renders a shell and all five tabs (overview, tasks, notes,
 * team, settings) off this single object, so loading it on the server removes
 * the second round trip from every one of those screens at once.
 */
export async function getProjectDetail(organizationId: string, projectId: string) {
  return db.query.project.findFirst({
    where: and(
      eq(project.id, projectId),
      eq(project.organizationId, organizationId),
      notDeleted(project.deletedAt)
    ),
    with: {
      contact: true,
      timeEntries: { with: { user: true, task: true } },
      members: { with: { member: { with: { user: true } } } },
      tasks: {
        with: {
          assignee: { with: { user: true } },
          team: true,
          createdBy: true,
          checklist: true,
          comments: { with: { author: true } },
        },
      },
      labels: true,
      teams: { with: { members: { with: { member: { with: { user: true } } } } } },
      milestones: true,
      notes: { with: { author: true } },
      runningTimers: { with: { task: true } },
    },
  });
}
