import { getServerContext } from "@/lib/server/context";
import { listJournalEntries } from "@/lib/server/data/entries";
import { toClient } from "@/lib/server/data/serialize";
import AccountingPage, { type Entry } from "./entries-client";

export default async function Page() {
  const ctx = await getServerContext();
  const entries = await listJournalEntries(ctx.organizationId);
  return <AccountingPage initialEntries={toClient<Entry[]>(entries)} />;
}
