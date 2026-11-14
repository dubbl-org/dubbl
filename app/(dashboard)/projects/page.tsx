import { getServerContext } from "@/lib/server/context";
import { listProjects } from "@/lib/server/data/projects";
import ProjectsPage from "./projects-client";

export default async function Page() {
  const ctx = await getServerContext();
  const projects = await listProjects(ctx.organizationId);
  return <ProjectsPage initialProjects={projects} />;
}
