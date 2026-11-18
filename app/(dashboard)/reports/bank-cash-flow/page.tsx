import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getFlow } from "@/app/api/v1/reports/bank-cash-flow/route";
import { GET as getAccounts } from "@/app/api/v1/bank-accounts/route";
import BankCashFlowPage, { type BankCashFlowInitial } from "./bank-cash-flow-client";

/** Defaults match the client: this year to date, grouped by month, all accounts. */
export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
    groupBy: "month",
  });

  const [flow, accounts] = await Promise.all([
    callRoute<BankCashFlowInitial["data"]>(getFlow, ctx, "reports/bank-cash-flow", params),
    callRoute<{ bankAccounts?: BankCashFlowInitial["bankAccounts"] }>(
      getAccounts,
      ctx,
      "bank-accounts"
    ),
  ]);

  return (
    <BankCashFlowPage
      initialData={{ data: flow ?? null, bankAccounts: accounts?.bankAccounts }}
    />
  );
}
