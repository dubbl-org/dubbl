import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/duplicate-detection/route";
import DuplicateDetectionPage, { type DuplicatePayload } from "./duplicate-detection-client";

/** No filters, no paging: the whole list is fixed until the data changes. */
export default async function Page() {
  const ctx = await getServerContext();
  const data = await callRoute<DuplicatePayload>(GET, ctx, "reports/duplicate-detection");
  return <DuplicateDetectionPage initialData={data} />;
}
