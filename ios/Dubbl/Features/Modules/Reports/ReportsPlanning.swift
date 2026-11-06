import SwiftUI

// Planning: the cash flow forecast, the financial calendar of what's due,
// and financial ratios with what each one means.

// MARK: - Cash flow forecast

/// `GET reports/cash-flow-forecast?weeks` -> `{ totalInflows, totalOutflows,
/// netForecast, weeks: [{ weekOf, inflows, outflows, net, cumulativeNet }],
/// entries: [{ date, type, description, amount }] }`. Home reads the totals as
/// `HomeCashForecast`.
struct ReportsForecastView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var weeks = 12

    private static let types = [
        "receivable": "Invoice due", "payable": "Bill due", "recurring_invoice": "Recurring invoice", "recurring_bill": "Recurring bill",
    ]

    var body: some View {
        ReportsPage("Cash flow forecast", path: "reports/cash-flow-forecast", query: ["weeks": "\(weeks)"], tilly: "Will I have enough cash over the next \(weeks) weeks? Which weeks look tight?") {
            ReportsChoice(options: [(4, "4 weeks"), (8, "8 weeks"), (12, "12 weeks"), (26, "6 months")], selection: $weeks)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let weekList = ReportsJSON.array(value["weeks"])
        let entries = ReportsJSON.array(value["entries"])
        let net = ReportsJSON.int(value["netForecast"])
        ReportsHeadline(
            label: "Expected net cash · next \(weeks) weeks", amount: net, currency: currency,
            caption: "From open invoices, bills and recurring templates"
        )
        ReportsFigures(items: [
            .money("Coming in", ReportsJSON.int(value["totalInflows"]), currency: currency, tint: DTheme.positive),
            .money("Going out", ReportsJSON.int(value["totalOutflows"]), currency: currency, tint: DTheme.orange),
        ])
        if let low = weekList.min(by: { ReportsJSON.int($0["cumulativeNet"]) < ReportsJSON.int($1["cumulativeNet"]) }), ReportsJSON.int(low["cumulativeNet"]) < 0 {
            ReportsNote(
                symbol: "exclamationmark.triangle.fill",
                text: "Tightest the week of \(DubblDate.short(low["weekOf"]?.stringValue)): \(Money.format(ReportsJSON.int(low["cumulativeNet"]), currency: currency)) on top of today's cash.",
                tone: .warning
            )
        }
        if weekList.count > 1 {
            ReportsColumnChart(
                points: weekList.enumerated().flatMap { offset, week in
                    let label = DubblDate.short(week["weekOf"]?.stringValue)
                    return [
                        ReportsChartPoint(label: label, series: "In", value: ReportsJSON.int(week["inflows"]), order: offset),
                        ReportsChartPoint(label: label, series: "Out", value: ReportsJSON.int(week["outflows"]), order: offset),
                    ]
                },
                line: weekList.enumerated().map { offset, week in
                    ReportsChartPoint(label: DubblDate.short(week["weekOf"]?.stringValue), series: "Running", value: ReportsJSON.int(week["cumulativeNet"]), order: offset)
                },
                currency: currency,
                colors: ["In": DTheme.positive, "Out": DTheme.chartSecondary, "Running": DTheme.ink]
            )
        }
        if entries.isEmpty {
            ReportsEmpty(symbol: "calendar.badge.clock", title: "Nothing expected", message: "Open invoices, bills and recurring templates due in this window show up here.")
        }
        ForEach(Array(weekList.enumerated()), id: \.offset) { offset, week in
            let start = week["weekOf"]?.stringValue ?? ""
            let next = weekList.indices.contains(offset + 1) ? (weekList[offset + 1]["weekOf"]?.stringValue ?? "9999") : "9999"
            let inWeek = entries.filter { ($0["date"]?.stringValue ?? "") >= start && ($0["date"]?.stringValue ?? "") < next }
            if !inWeek.isEmpty {
                ReportsSection(title: "Week of \(DubblDate.short(start))", trailing: ReportsText.signedMoney(ReportsJSON.int(week["net"]), currency: currency)) {
                    ForEach(Array(inWeek.enumerated()), id: \.offset) { _, entry in
                        let amount = ReportsJSON.int(entry["amount"])
                        ReportsRow(
                            title: entry["description"]?.stringValue ?? "",
                            subtitle: "\(DubblDate.short(entry["date"]?.stringValue)) · \(Self.types[entry["type"]?.stringValue ?? ""] ?? "Expected")",
                            value: ReportsText.signedMoney(amount, currency: currency), valueTone: amount >= 0 ? .positive : .neutral
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Financial calendar

/// `GET reports/financial-calendar?startDate&endDate` -> `{ events: [{ date, type:
/// invoice_due|bill_due|recurring_generation|budget_period_start, title, amount, id,
/// status }] }`, sorted by date.
struct ReportsCalendarView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var days = 30

    private var query: [String: String?] {
        let today = Date.now
        let end = ReportsPeriod.calendar.date(byAdding: .day, value: days, to: today) ?? today
        return ["startDate": DubblDate.string(today), "endDate": DubblDate.string(end)]
    }

    var body: some View {
        ReportsPage("Financial calendar", path: "reports/financial-calendar", query: query, tilly: "What's due in and out over the next \(days) days?") {
            ReportsChoice(options: [(14, "2 weeks"), (30, "30 days"), (60, "60 days"), (90, "90 days")], selection: $days)
        } content: { value in
            content(value)
        }
    }

    private static func style(_ type: String) -> (symbol: String, tone: Tone, label: String) {
        switch type {
        case "invoice_due": ("arrow.down.left", .positive, "Invoice due")
        case "bill_due": ("arrow.up.right", .orange, "Bill due")
        case "recurring_generation": ("arrow.triangle.2.circlepath", .info, "Recurring")
        case "budget_period_start": ("target", .special, "Budget period starts")
        default: ("calendar", .neutral, "Event")
        }
    }

    private static func dayTitle(_ day: String) -> String {
        guard let date = DubblDate.parseDay(day) else { return day }
        let calendar = ReportsPeriod.calendar
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let events = ReportsJSON.array(value["events"])
        let sum = { (type: String) in events.filter { $0["type"]?.stringValue == type }.reduce(0) { $0 + ReportsJSON.int($1["amount"]) } }
        let incoming = sum("invoice_due"), outgoing = sum("bill_due")
        ReportsHeadline(
            label: "Due in minus due out · next \(days) days", amount: incoming - outgoing, currency: currency,
            caption: ReportsText.count(events.count, "date to know", "dates to know")
        )
        ReportsFigures(items: [
            .money("Due to you", incoming, currency: currency, tint: DTheme.positive),
            .money("You owe", outgoing, currency: currency, tint: DTheme.orange),
            .money("Recurring", sum("recurring_generation"), currency: currency, tint: DTheme.accent),
        ])
        if events.isEmpty {
            ReportsEmpty(symbol: "calendar", title: "A quiet stretch", message: "No invoices, bills or recurring runs fall due in this window.")
        }
        let days = Array(Set(events.compactMap { $0["date"]?.stringValue })).sorted()
        ForEach(days, id: \.self) { day in
            let list = events.filter { $0["date"]?.stringValue == day }
            ReportsSection(title: Self.dayTitle(day), trailing: ReportsText.count(list.count, "item")) {
                ForEach(Array(list.enumerated()), id: \.offset) { _, event in
                    eventRow(event, currency: currency)
                }
            }
        }
    }

    @ViewBuilder
    private func eventRow(_ event: JSONValue, currency: String) -> some View {
        let type = event["type"]?.stringValue ?? ""
        let style = Self.style(type)
        let status = event["status"]?.stringValue
        let row = HStack(spacing: 12) {
            IconTile(symbol: style.symbol, tone: style.tone, size: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(event["title"]?.stringValue ?? "")
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                Text([style.label, status.map(RecordFormat.statusLabel)].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 12.5))
                    .foregroundStyle(status == "overdue" ? DTheme.negative : DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            if let amount = event["amount"]?.intValue {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
        switch type {
        case "invoice_due": ReportsDocumentLink(kind: .invoice, id: event.recordID) { row }
        case "bill_due": ReportsDocumentLink(kind: .bill, id: event.recordID) { row }
        default: row
        }
    }
}

// MARK: - Financial ratios

/// `GET reports/financial-ratios?startDate&endDate` -> `{ ratios: { currentRatio,
/// quickRatio, debtToEquity, grossMargin, netMargin, dso, dpo, returnOnAssets,
/// returnOnEquity } (null when undefined), balances: { totalAssets, ... } }`.
struct ReportsRatiosView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    private struct Ratio {
        let key: String
        let label: String
        let meaning: String
        let unit: String
        let good: (Double) -> Bool
    }

    private static let groups: [(title: String, ratios: [Ratio])] = [
        ("Can you cover your bills?", [
            Ratio(key: "currentRatio", label: "Current ratio", meaning: "Short-term assets for every dollar due soon. 1x or more is comfortable.", unit: "x", good: { $0 >= 1 }),
            Ratio(key: "quickRatio", label: "Quick ratio", meaning: "The same without stock you'd have to sell first.", unit: "x", good: { $0 >= 1 }),
            Ratio(key: "debtToEquity", label: "Debt to equity", meaning: "What you owe against what you own outright. Lower is safer.", unit: "x", good: { $0 <= 2 }),
        ]),
        ("Margins", [
            Ratio(key: "grossMargin", label: "Gross margin", meaning: "What's left of each sale after direct costs.", unit: "%", good: { $0 > 0 }),
            Ratio(key: "netMargin", label: "Net margin", meaning: "What's left of each sale after every cost.", unit: "%", good: { $0 > 0 }),
        ]),
        ("Speed", [
            Ratio(key: "dso", label: "Days to get paid", meaning: "How long customers take to pay, on average.", unit: " days", good: { $0 <= 45 }),
            Ratio(key: "dpo", label: "Days to pay", meaning: "How long you take to pay suppliers.", unit: " days", good: { $0 <= 60 }),
        ]),
        ("Returns", [
            Ratio(key: "returnOnAssets", label: "Return on assets", meaning: "Profit for every dollar the business holds.", unit: "%", good: { $0 > 0 }),
            Ratio(key: "returnOnEquity", label: "Return on equity", meaning: "Profit for every dollar of the owners' stake.", unit: "%", good: { $0 > 0 }),
        ]),
    ]

    private static let balances: [(key: String, label: String)] = [
        ("totalRevenue", "Revenue"), ("totalExpenses", "Expenses"), ("netIncome", "Net income"), ("currentAssets", "Current assets"),
        ("currentLiabilities", "Current liabilities"), ("totalAssets", "Total assets"), ("totalLiabilities", "Total liabilities"),
        ("totalEquity", "Equity"), ("receivablesDue", "Owed to you"), ("payablesDue", "You owe"),
    ]

    var body: some View {
        ReportsPage("Financial ratios", path: "reports/financial-ratios", query: period.query, tilly: "What do my financial ratios say about the business? What should I work on?") {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let values = Self.groups.flatMap(\.ratios).compactMap { ratio in ReportsJSON.double(value["ratios.\(ratio.key)"]).map { (ratio, $0) } }
        let healthy = values.filter { $0.0.good($0.1) }.count
        VStack(alignment: .leading, spacing: 6) {
            Text("Healthy ratios · \(period.label)")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text("\(healthy) of \(values.count)")
                .font(.system(size: 38, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.1)
                .foregroundStyle(DTheme.ink)
            Text("Green is where the usual rule of thumb is met.")
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        ForEach(Self.groups, id: \.title) { group in
            ReportsSection(title: group.title) {
                ForEach(group.ratios, id: \.key) { ratio in
                    let number = ReportsJSON.double(value["ratios.\(ratio.key)"])
                    ReportsRow(
                        title: ratio.label, subtitle: ratio.meaning,
                        value: number.map { $0.formatted(.number.precision(.fractionLength(0 ... 2))) + ratio.unit } ?? "–",
                        valueTone: number.map { ratio.good($0) ? .positive : .warning } ?? .neutral
                    )
                }
            }
        }
        ReportsSection(title: "Worked out from") {
            ForEach(Self.balances, id: \.key) { key, label in
                ReportsRow(title: label, amount: ReportsJSON.int(value["balances.\(key)"]), currency: currency)
            }
        }
    }
}
