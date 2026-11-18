import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getGroups } from "@/app/api/v1/consolidation/groups/route";
import { GET as getReport } from "@/app/api/v1/consolidation/groups/[id]/report/route";
import { GET as getOrganization } from "@/app/api/v1/organization/route";
import ConsolidationPage, { type ConsolidationPayload } from "./consolidation-client";

/** First group, its report and the org list, so the page opens on real figures. */
export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const range = new URLSearchParams({
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  });

  const [groups, organization] = await Promise.all([
    callRoute<{ groups?: Array<{ id: string }> }>(getGroups, ctx, "consolidation/groups"),
    callRoute<{ organizations?: ConsolidationPayload["organizations"] }>(
      getOrganization,
      ctx,
      "organization"
    ),
  ]);

  const first = groups?.groups?.[0];
  const report = first
    ? await callRoute<ConsolidationPayload["report"]>(
        getReport,
        ctx,
        `consolidation/groups/${first.id}/report`,
        range,
        { id: first.id }
      )
    : null;

  return (
    <ConsolidationPage
      initialData={{
        groups: groups?.groups as ConsolidationPayload["groups"],
        report: report ?? null,
        organizations: organization?.organizations,
      }}
    />
  );
}
