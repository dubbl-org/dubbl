import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side project list for the first paint.
 *
 * Mirrors GET /api/v1/projects (same filters, same relations) so the server
 * component can render the page with data instead of shipping an empty shell
 * and fetching after hydration. The API route stays the source for client-side
 * filtering and mutations.
 */
export async function listProjects(organizationId: string, status?: string) {
  const conditions = [
    eq(project.organizationId, organizationId),
    notDeleted(project.deletedAt),
  ];
  if (status) {
    conditions.push(eq(project.status, status as (typeof project.status.enumValues)[number]));
  }

  return db.query.project.findMany({
    where: and(...conditions),
    orderBy: desc(project.createdAt),
    with: {
      contact: true,
      members: { with: { member: { with: { user: true } } } },
      tasks: true,
    },
  });
}
