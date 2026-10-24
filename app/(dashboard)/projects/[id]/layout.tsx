import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/server/context";
import { getProjectDetail } from "@/lib/server/data/project-detail";
import { toClient } from "@/lib/server/data/serialize";
import { ProjectShell } from "./project-shell";
import type { ProjectDetail } from "./project-context";

/**
 * The project layout loads the project and all of its relations once, on the
 * server, so every tab (overview, tasks, notes, team, settings) renders with
 * data instead of each waiting for the client context's fetch.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getServerContext();
  const project = await getProjectDetail(ctx.organizationId, id);
  if (!project) notFound();

  return (
    <ProjectShell initialProject={toClient<ProjectDetail>(project)}>
      {children}
    </ProjectShell>
  );
}
