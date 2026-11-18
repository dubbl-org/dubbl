import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/bank-reconciliation-status/route";
import BankReconciliationStatusPage from "./bank-reconciliation-status-client";

/** A snapshot of every bank account, so there is no filter to reproduce. */
export default async function Page() {
  const ctx = await getServerContext();
  const data = await callRoute<{
    accounts?: unknown[];
    [k: string]: unknown;
  }>(GET, ctx, "reports/bank-reconciliation-status");
  return <BankReconciliationStatusPage initialData={data as never} />;
}
