"use client";

import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { SalesBreakdown, type BreakdownRow } from "../_sales-breakdown";

interface Item {
  itemId: string | null;
  itemCode: string | null;
  itemName: string;
  quantity: number;
  net: number;
  tax: number;
  gross: number;
}

function pick(json: Record<string, unknown>): BreakdownRow[] {
  return ((json.items as Item[] | undefined) ?? []).map((i) => ({
    key: i.itemId ?? "none",
    name: i.itemId ? i.itemName : "Not linked to an item",
    code: i.itemCode,
    href: i.itemId ? `/inventory/${i.itemId}` : null,
    net: i.net,
    tax: i.tax,
    gross: i.gross,
    // Line quantities are stored in hundredths (150 = 1.5 units)
    count: i.quantity / 100,
  }));
}

export default function SalesByItemPage() {
  useDocumentTitle("Reports · Sales by item");
  return (
    <SalesBreakdown
      endpoint="/api/v1/reports/sales-by-item"
      title="Sales by item"
      description="What you sell the most of, ranked by what you invoiced."
      help="Every product or service you invoiced in the period, with how many you sold and its share of your sales. Invoice lines typed in by hand without picking an item are grouped together."
      nameLabel="Item"
      countLabel="Units sold"
      formatCount={(n) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }))}
      pick={pick}
    />
  );
}
