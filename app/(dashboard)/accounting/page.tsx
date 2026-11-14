import { getServerContext } from "@/lib/server/context";
import { listJournalEntries } from "@/lib/server/data/entries";
import { toClient } from "@/lib/server/data/serialize";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import AccountingPage, { type Entry } from "./entries-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [entries, org] = await Promise.all([
    listJournalEntries(ctx.organizationId),
    db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { defaultCurrency: true },
    }),
  ]);
  return (
    <AccountingPage
      initialEntries={toClient<Entry[]>(entries)}
      currency={org?.defaultCurrency ?? "USD"}
    />
  );
}
