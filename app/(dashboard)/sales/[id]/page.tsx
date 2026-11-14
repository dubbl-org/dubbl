import { notFound } from "next/navigation";
import { getServerContext } from "@/lib/server/context";
import { getInvoiceDetail } from "@/lib/server/data/invoice-detail";
import { toClient } from "@/lib/server/data/serialize";
import InvoiceDetailPage, {
  type InvoiceDetail,
  type PaymentRecord,
  type BaseAmounts,
} from "./invoice-detail-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getServerContext();
  const detail = await getInvoiceDetail(ctx.organizationId, id);
  if (!detail) notFound();
  return (
    <InvoiceDetailPage
      initialInvoice={toClient<InvoiceDetail>(detail.invoice)}
      initialPayments={toClient<PaymentRecord[]>(detail.payments)}
      initialBase={toClient<BaseAmounts | null>(detail.base)}
    />
  );
}
