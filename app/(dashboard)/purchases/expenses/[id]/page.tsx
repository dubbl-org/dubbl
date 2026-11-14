import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/server/context";
import { getExpenseClaim } from "@/lib/server/data/expense-detail";
import { toClient } from "@/lib/server/data/serialize";
import ExpenseDetailPage, { type ExpenseDetail } from "./expense-detail-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServerContext();
  const claim = await getExpenseClaim(ctx.organizationId, id);
  if (!claim) notFound();
  return <ExpenseDetailPage initialClaim={toClient<ExpenseDetail>(claim)} />;
}
