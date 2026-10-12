import {
  Boxes,
  Briefcase,
  Coins,
  FileStack,
  FolderOpen,
  Gauge,
  History,
  Receipt,
  ShoppingCart,
  Target,
} from "lucide-react";
import { Eyebrow, Heading, Painting, Section } from "@/components/landing/ledger";
import { backdrops, type Backdrop } from "@/components/landing/backdrops";
import {
  BankFeedMock,
  CountryMock,
  InvoiceMock,
  PayRunMock,
  ReportMock,
  TaxReturnMock,
  TillyMock,
} from "@/components/landing/mockups";
import { FitStage, Live } from "@/components/landing/stage";

type Feature = {
  title: string;
  body: string;
  label: string;
  backdrop: Backdrop;
  mock: React.ReactNode;
  span: string;
  /** Design size of the panel the mockup is laid out in. */
  stage: [number, number];
};

const features: Feature[] = [
  {
    title: "Reconcile in a click",
    body: "Bank lines arrive with a suggested match. Receipts attach right on the line.",
    label: "Bank feed with suggested matches and two receipts attached to a line",
    backdrop: backdrops.mistValley,
    mock: <BankFeedMock />,
    stage: [760, 380],
    span: "lg:col-span-7",
  },
  {
    title: "Invoices that get paid",
    body: "A pay-online link on every invoice. The journal posts itself.",
    label: "A paid invoice and the balanced journal it posted",
    backdrop: backdrops.amberValley,
    mock: <InvoiceMock />,
    stage: [540, 380],
    span: "lg:col-span-5",
  },
  {
    title: "Reports, always current",
    body: "Profit and loss, balance sheet and cash flow — live, no month-end.",
    label: "Profit and loss for October",
    backdrop: backdrops.birchGold,
    mock: <ReportMock />,
    stage: [430, 380],
    span: "lg:col-span-4",
  },
  {
    title: "Tax returns, ready to file",
    body: "VAT, GST or sales tax worked out from every line.",
    label: "A VAT return ready to file",
    backdrop: backdrops.redRanges,
    mock: <TaxReturnMock />,
    stage: [430, 380],
    span: "lg:col-span-4",
  },
  {
    title: "Ask Tilly",
    body: "An assistant that reads your books — and does the work.",
    label: "Tilly answering which invoices are overdue",
    backdrop: backdrops.moonGrass,
    mock: <TillyMock />,
    stage: [430, 380],
    span: "lg:col-span-4",
  },
  {
    title: "Set up for your country",
    body: "Local chart of accounts, tax rates and year end from day one.",
    label: "Choosing a country, with its chart of accounts ready",
    backdrop: backdrops.savanna,
    mock: <CountryMock />,
    stage: [540, 380],
    span: "lg:col-span-5",
  },
  {
    title: "Payroll on the same ledger",
    body: "Pay runs, payslips and leave — posted the moment you pay.",
    label: "October pay run for four employees",
    backdrop: backdrops.terraces,
    mock: <PayRunMock />,
    stage: [760, 380],
    span: "lg:col-span-7",
  },
];

const included = [
  { icon: Boxes, label: "Inventory" },
  { icon: Briefcase, label: "Projects & time" },
  { icon: Target, label: "CRM & deals" },
  { icon: ShoppingCart, label: "Purchase orders" },
  { icon: Receipt, label: "Expense claims" },
  { icon: FileStack, label: "Fixed assets" },
  { icon: Coins, label: "Multi-currency" },
  { icon: FolderOpen, label: "Documents" },
  { icon: Gauge, label: "Budgets" },
  { icon: History, label: "Audit trail" },
];

function FeatureCell({ f }: { f: Feature }) {
  return (
    <div className={f.span}>
      <Live className="relative isolate h-[300px] overflow-hidden rounded-xl sm:h-[340px]">
        <Painting backdrop={f.backdrop} sizes="(min-width: 1024px) 45vw, 100vw" />
        <div role="img" aria-label={f.label} className="absolute inset-0">
          <FitStage width={f.stage[0]} height={f.stage[1]}>
            <div className="absolute left-10 top-10">{f.mock}</div>
          </FitStage>
        </div>
      </Live>
      <h3 className="mt-6 text-[17px] font-semibold tracking-[-0.025em] text-foreground">{f.title}</h3>
      <p className="mt-1 max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">{f.body}</p>
    </div>
  );
}

export function Features() {
  return (
    <Section id="product" className="px-0 sm:px-0 lg:px-0">
      <div className="px-5 pb-12 pt-20 sm:px-8 lg:px-12 lg:pb-14 lg:pt-28">
        <Eyebrow index="01">Product</Eyebrow>
        <Heading lead="One app." className="mt-5 max-w-[18ch]">
          Everything your business runs on.
        </Heading>
      </div>

      <div className="grid gap-x-6 gap-y-14 px-5 pb-20 sm:px-8 lg:grid-cols-12 lg:px-12 lg:pb-28">
        {features.map((f) => (
          <FeatureCell key={f.title} f={f} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-y-5 border-t border-border px-5 py-8 sm:grid-cols-5 sm:px-8 lg:px-12">
        {included.map((m) => (
          <div key={m.label} className="flex items-center gap-3">
            <m.icon className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
            <span className="text-[13px] font-medium text-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
