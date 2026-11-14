import { getServerContext } from "@/lib/server/context";
import { listChartAccounts } from "@/lib/server/data/accounts";
import { toClient } from "@/lib/server/data/serialize";
import AccountsPage, { type Account } from "./accounts-client";

export default async function Page() {
  const ctx = await getServerContext();
  const accounts = await listChartAccounts(ctx.organizationId);
  return <AccountsPage initialAccounts={toClient<Account[]>(accounts)} />;
}
