import SwiftUI

/// Every report in one place (the web's /reports): a quick look at this
/// year's profit, what's owed and the next four weeks of cash, then each group
/// of reports with a line on what it answers. The groups are More's own, so
/// the two stay in step.
struct ReportsHomeView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var profit: HomeProfitAndLoss?
    @State private var receivables: HomeAgingReport?
    @State private var forecast: HomeCashForecast?
    @State private var loaded = false

    /// One line per report: the question it answers.
    static let blurbs: [String: String] = [
        "/reports/executive-summary": "Key numbers this period next to last",
        "/reports/profit-and-loss": "What you earned minus what you spent",
        "/reports/balance-sheet": "What you own and owe on a date",
        "/reports/cash-flow": "How cash moved in and out",
        "/reports/pack": "The main statements in one pack",
        "/reports/tracking": "Profit by cost center or project",
        "/reports/pnl-comparison": "Months, quarters or years side by side",
        "/reports/budget-vs-actual": "Where you're over or under plan",
        "/reports/expense-analytics": "Spending by category, with the trend",
        "/reports/profitability": "Profit by customer or project",
        "/reports/vendor-spend": "Your biggest suppliers",
        "/reports/sales-by-customer": "Who your sales come from",
        "/reports/sales-by-item": "What sells most",
        "/reports/aged-receivables": "Who owes you, and how late",
        "/reports/aged-payables": "What you owe, and when",
        "/reports/payment-performance": "How fast money comes in and goes out",
        "/reports/duplicate-detection": "Invoices or bills entered twice",
        "/reports/vat-return": "Your VAT return, box by box",
        "/reports/tax-summary": "Tax collected and paid by rate",
        "/reports/1099": "Vendors who need a 1099",
        "/reports/cash-flow-forecast": "Cash expected over the coming weeks",
        "/reports/financial-calendar": "What falls due, day by day",
        "/reports/financial-ratios": "Liquidity, margins and returns",
        "/reports/trial-balance": "Every account's debit or credit balance",
        "/reports/general-ledger": "Every account's movements",
        "/reports/comparative-balance-sheet": "Balance sheet at past month ends",
        "/reports/consolidation": "Results across your organizations",
        "/reports/bank-reconciliation-status": "Bank lines left to reconcile",
        "/reports/bank-cash-flow": "Money in and out of the bank",
        "/reports/custom": "Build a report from your own columns",
        "/reports/saved": "Reports you've saved",
        "/reports/schedules": "Reports emailed on a timetable",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                quickLook
                    .reveal(loaded, 0)
                ForEach(Array(MoreDirectory.reports.groups.enumerated()), id: \.offset) { index, group in
                    VStack(alignment: .leading, spacing: 8) {
                        if let title = group.title { SectionLabel(title) }
                        CardStack(dividerInset: 62) {
                            ForEach(group.pages) { page in
                                row(page)
                            }
                        }
                    }
                    .reveal(loaded, index + 1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    env.router.askTilly(MoreDirectory.reports.tillyPrompt, page: "reports")
                } label: {
                    Image(systemName: "sparkle")
                }
                .accessibilityLabel("Ask Tilly")
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        let year = ReportsPeriod.thisYear
        async let pl: HomeProfitAndLoss? = try? env.api.get("reports/profit-and-loss", query: year.query)
        async let aging: HomeAgingReport? = try? env.api.get("reports/aged-receivables")
        async let cash: HomeCashForecast? = try? env.api.get("reports/cash-flow-forecast", query: ["weeks": "4"])
        let (p, a, c) = await (pl, aging, cash)
        withAnimation(.snappy) {
            profit = p
            receivables = a
            forecast = c
            loaded = true
        }
    }

    private var quickLook: some View {
        let currency = env.session.currency
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("This year so far")
            VStack(alignment: .leading, spacing: 14) {
                NavigationLink(value: RecordPageRoute(path: "/reports/profit-and-loss")) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Net income")
                                .font(.system(size: 13.5, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                            Text(profit.map { Money.format($0.netIncome, currency: currency) } ?? "–")
                                .font(.system(size: 32, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .tracking(-0.9)
                                .foregroundStyle((profit?.netIncome ?? 0) < 0 ? DTheme.negative : DTheme.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                                .contentTransition(.numericText())
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Hairline()
                LedgerTotals(items: [
                    LedgerTotals.Item(label: "Revenue", value: profit.map { Money.short($0.totalRevenue, currency: currency) }, tint: DTheme.accent),
                    LedgerTotals.Item(label: "To collect", value: receivables.map { Money.short($0.grandTotal, currency: currency) }, detail: receivables.map { "\(Money.short($0.overdue, currency: currency)) late" }, tint: DTheme.warning),
                    LedgerTotals.Item(label: "Next 4 weeks", value: forecast.map { Money.short($0.netForecast, currency: currency) }, detail: "cash", tint: DTheme.positive),
                ])
            }
            .dubblCard(padding: 16)
        }
    }

    @ViewBuilder
    private func row(_ page: MorePage) -> some View {
        if case let .page(path) = page.target {
            NavigationLink(value: RecordPageRoute(path: path)) {
                HStack(spacing: 14) {
                    IconTile(symbol: page.symbol, tone: .neutral, size: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(page.title)
                            .font(.system(size: 15.5, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                        if let blurb = Self.blurbs[path] {
                            Text(blurb)
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
        }
    }
}
