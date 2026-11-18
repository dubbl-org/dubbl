import { getServerContext } from "@/lib/server/context";
import { listBills, listBillsForOverview, billStatusCounts } from "@/lib/server/data/bills";
import { toClient } from "@/lib/server/data/serialize";
import PurchasesPage, { type Bill } from "./purchases-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [{ bills, total }, allBills, counts] = await Promise.all([
    listBills(ctx.organizationId),
    listBillsForOverview(ctx.organizationId),
    billStatusCounts(ctx.organizationId),
  ]);
  return (
    <PurchasesPage
      initialBills={toClient<Bill[]>(bills)}
      initialTotal={total}
      initialAllBills={toClient<Bill[]>(allBills)}
      initialCounts={counts}
      initialHasMore={bills.length < total}
    />
  );
}
