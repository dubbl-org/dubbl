import { getServerContext } from "@/lib/server/context";
import { listExpenseClaims, expenseStatusCounts } from "@/lib/server/data/expenses";
import { toClient } from "@/lib/server/data/serialize";
import ExpensesPage, { type ExpenseClaim } from "./expenses-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [{ claims, total }, counts] = await Promise.all([
    listExpenseClaims(ctx.organizationId),
    expenseStatusCounts(ctx.organizationId),
  ]);
  return (
    <ExpensesPage
      initialClaims={toClient<ExpenseClaim[]>(claims)}
      initialCounts={counts}
      initialHasMore={claims.length < total}
    />
  );
}
