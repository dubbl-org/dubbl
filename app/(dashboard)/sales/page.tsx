import { getServerContext } from "@/lib/server/context";
import { listInvoices, invoiceSummary, recentReceivedPayments } from "@/lib/server/data/invoices";
import { toClient } from "@/lib/server/data/serialize";
import InvoicesPage, { type Invoice, type PaymentRecord } from "./invoices-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [{ invoices, total }, summary, payments] = await Promise.all([
    listInvoices(ctx.organizationId),
    invoiceSummary(ctx.organizationId),
    recentReceivedPayments(ctx.organizationId),
  ]);
  return (
    <InvoicesPage
      initialInvoices={toClient<Invoice[]>(invoices)}
      initialTotal={total}
      initialSummary={summary}
      initialPayments={toClient<PaymentRecord[]>(payments)}
    />
  );
}
