import SwiftUI

// The core statements: executive summary, profit and loss, balance sheet,
// cash flow, the accountant's pack, comparative balance sheet, trial balance
// and general ledger. Each leads with its bottom line, then its sections.

// MARK: - Executive summary

/// `GET reports/executive-summary?startDate&endDate` -> `{ period, priorPeriod,
/// kpis: [{ key, label, current, prior, delta, deltaPercent }] }`, cents.
struct ReportsExecutiveView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    private static let labels = [
        "revenue": "Revenue", "grossProfit": "Gross profit", "expenses": "Operating expenses", "netIncome": "Net income",
        "cash": "Cash on hand", "accountsReceivable": "Owed to you", "accountsPayable": "You owe",
    ]
    /// KPIs where going up is bad news.
    private static let upIsBad: Set<String> = ["expenses", "accountsPayable"]

    var body: some View {
        ReportsPage(
            "Executive summary", path: "reports/executive-summary", query: period.query,
            tilly: "Summarize how the business did from \(period.label) compared with the period before.",
            export: ReportsExport(path: "reports/executive-summary", query: period.query, name: "Executive summary \(period.endString)")
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let kpis = ReportsJSON.array(value["kpis"])
        let net = kpis.first { $0["key"]?.stringValue == "netIncome" }
        let prior = "\(DubblDate.short(ReportsJSON.string(value["priorPeriod.startDate"]))) – \(DubblDate.short(ReportsJSON.string(value["priorPeriod.endDate"])))"
        if let net {
            let percent = ReportsJSON.double(net["deltaPercent"])
            ReportsHeadline(
                label: "Net income · \(period.label)",
                amount: ReportsJSON.int(net["current"]),
                currency: currency,
                caption: "\(ReportsText.change(percent)) vs \(prior)",
                captionTone: (percent ?? 0) >= 0 ? .positive : .negative
            )
        }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(Array(kpis.enumerated()), id: \.offset) { _, kpi in
                tile(kpi, currency: currency)
            }
        }
        Text("Compared with \(prior), the same number of days just before.")
            .font(.system(size: 12.5))
            .foregroundStyle(DTheme.inkTertiary)
            .padding(.horizontal, 4)
    }

    private func tile(_ kpi: JSONValue, currency: String) -> some View {
        let key = kpi["key"]?.stringValue ?? ""
        let current = ReportsJSON.int(kpi["current"])
        let prior = ReportsJSON.int(kpi["prior"])
        let percent = ReportsJSON.double(kpi["deltaPercent"])
        let delta = ReportsJSON.int(kpi["delta"])
        let good = Self.upIsBad.contains(key) ? delta <= 0 : delta >= 0
        return VStack(alignment: .leading, spacing: 6) {
            Text(Self.labels[key] ?? kpi["label"]?.stringValue ?? key)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
                .lineLimit(1)
            Text(Money.short(current, currency: currency))
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(current < 0 ? DTheme.negative : DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 4) {
                if delta != 0 {
                    Image(systemName: delta > 0 ? "arrow.up.right" : "arrow.down.right")
                        .font(.system(size: 10.5, weight: .bold))
                }
                Text(ReportsText.change(percent))
                    .font(.system(size: 12.5, weight: .semibold))
                Text("was \(Money.short(prior, currency: currency))")
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkTertiary)
                    .lineLimit(1)
            }
            .monospacedDigit()
            .foregroundStyle(delta == 0 ? DTheme.inkSecondary : good ? DTheme.positive : DTheme.negative)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dubblCard(padding: 14, radius: 18)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Profit and loss

/// `GET reports/profit-and-loss?startDate&endDate&basis[&compareFrom&compareTo]`
/// -> `{ revenue: [{ accountId, accountName, accountCode, balance }],
/// totalRevenue, expenses, totalExpenses, netIncome, comparison? }`.
struct ReportsProfitLossView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var basis = "accrual"
    @State private var compare = false

    private var query: [String: String?] {
        var query = period.query
        query["basis"] = basis
        if compare {
            query["compareFrom"] = period.previous.startString
            query["compareTo"] = period.previous.endString
        }
        return query
    }

    var body: some View {
        ReportsPage(
            "Profit and loss", path: "reports/profit-and-loss", query: query,
            tilly: "Walk me through my profit and loss for \(period.label). What drove it?",
            export: ReportsExport(path: "reports/profit-and-loss", query: query, name: "Profit and loss \(period.startString) to \(period.endString)")
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ReportsChip(title: "Accrual", selected: basis == "accrual") { basis = "accrual" }
                        ReportsChip(title: "Cash basis", selected: basis == "cash") { basis = "cash" }
                        Rectangle().fill(DTheme.hairline).frame(width: 1, height: 18).padding(.horizontal, 4)
                        ReportsChip(title: "Vs previous period", symbol: "arrow.left.arrow.right", selected: compare) { compare.toggle() }
                    }
                    .padding(.horizontal, 16)
                }
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let revenue = ReportsJSON.int(value["totalRevenue"])
        let expenses = ReportsJSON.int(value["totalExpenses"])
        let net = ReportsJSON.int(value["netIncome"])
        let comparison = value["comparison"]
        let priorNet = comparison.map { ReportsJSON.int($0["netIncome"]) }
        let margin = revenue != 0 ? Double(net) / Double(revenue) * 100 : nil
        let caption: String = {
            var parts = [margin.map { "\(ReportsText.percent($0)) margin" } ?? "No revenue yet"]
            if let priorNet {
                let change = priorNet != 0 ? Double(net - priorNet) / Double(abs(priorNet)) * 100 : nil
                parts.append("\(ReportsText.change(change)) vs previous period")
            }
            return parts.joined(separator: " · ")
        }()
        ReportsHeadline(label: "Net income · \(period.label)", amount: net, currency: currency, caption: caption, captionTone: net >= 0 ? .neutral : .negative)
        ReportsFigures(items: [
            .money("Revenue", revenue, currency: currency, detail: comparison.map { "was \(Money.short(ReportsJSON.int($0["totalRevenue"]), currency: currency))" }, tint: DTheme.accent),
            .money("Expenses", expenses, currency: currency, detail: comparison.map { "was \(Money.short(ReportsJSON.int($0["totalExpenses"]), currency: currency))" }, tint: DTheme.orange),
        ])
        if revenue == 0, expenses == 0 {
            ReportsEmpty(symbol: "chart.line.uptrend.xyaxis", title: "Nothing posted", message: "No income or expenses were recorded in this period.")
        } else {
            section("Revenue", lines: ReportsJSON.array(value["revenue"]), prior: ReportsJSON.array(comparison?["revenue"]), total: revenue, currency: currency)
            section("Expenses", lines: ReportsJSON.array(value["expenses"]), prior: ReportsJSON.array(comparison?["expenses"]), total: expenses, currency: currency)
            CardStack {
                ReportsTotalRow(title: "Net income", amount: net, currency: currency, tone: net < 0 ? .negative : .neutral)
            }
        }
    }

    private func section(_ title: String, lines: [JSONValue], prior: [JSONValue], total: Int, currency: String) -> some View {
        let priorByID = Dictionary(prior.compactMap { line in line["accountId"]?.stringValue.map { ($0, ReportsJSON.int(line["balance"])) } }, uniquingKeysWith: { a, _ in a })
        let sorted = lines.sorted { ReportsJSON.int($0["balance"]) > ReportsJSON.int($1["balance"]) }
        return ReportsSection(title: title, trailing: ReportsText.count(lines.count, "account")) {
            ForEach(Array(sorted.enumerated()), id: \.offset) { _, line in
                let id = line["accountId"]?.stringValue
                let amount = ReportsJSON.int(line["balance"])
                let share = total != 0 ? "\(ReportsText.percent(Double(amount) / Double(total) * 100, digits: 0)) of \(title.lowercased())" : nil
                let was = priorByID.isEmpty ? nil : "was \(Money.format(priorByID[id ?? ""] ?? 0, currency: currency))"
                ReportsAccountRow(
                    accountId: id, name: line["accountName"]?.stringValue ?? "Account", code: line["accountCode"]?.stringValue,
                    subtitle: was ?? share, amount: amount, currency: currency, start: period.startString, end: period.endString
                )
            }
            ReportsTotalRow(title: "Total \(title.lowercased())", amount: total, currency: currency)
        }
    }
}

// MARK: - Balance sheet

/// `GET reports/balance-sheet?asAt` -> `{ asAt, assets|liabilities|equity:
/// { accounts: [{ accountId, code, name, balance }], total } }`. Balances here
/// are decimal strings in major units ("1234.56"), not cents.
struct ReportsBalanceSheetView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var asAt = Date.now

    private var asAtString: String { DubblDate.string(asAt) }

    var body: some View {
        ReportsPage(
            "Balance sheet", path: "reports/balance-sheet", query: ["asAt": asAtString],
            tilly: "Explain my balance sheet as at \(ReportsDates.day(asAt)). Is the business in good shape?",
            export: ReportsExport(path: "reports/balance-sheet", query: ["asAt": asAtString], name: "Balance sheet \(asAtString)")
        ) {
            ReportsAsAtBar(date: $asAt)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let assets = ReportsJSON.decimalCents(value["assets.total"], currency: currency)
        let liabilities = ReportsJSON.decimalCents(value["liabilities.total"], currency: currency)
        let equity = ReportsJSON.decimalCents(value["equity.total"], currency: currency)
        let gap = assets - (liabilities + equity)
        ReportsHeadline(label: "Net assets", amount: assets - liabilities, currency: currency, caption: "As at \(ReportsDates.day(asAt))")
        ReportsFigures(items: [
            .money("Assets", assets, currency: currency, tint: DTheme.accent),
            .money("Liabilities", liabilities, currency: currency, tint: DTheme.orange),
            .money("Equity", equity, currency: currency, tint: DTheme.special),
        ])
        if abs(gap) <= 1 {
            ReportsNote(symbol: "checkmark.circle.fill", text: "Balanced: assets equal liabilities plus equity.", tone: .positive)
        } else {
            ReportsNote(symbol: "exclamationmark.triangle.fill", text: "Out of balance by \(Money.format(gap, currency: currency)). Check for unposted or one-sided entries.", tone: .negative)
        }
        ReportsBalanceSection(title: "Assets", section: value["assets"], currency: currency, end: asAtString)
        ReportsBalanceSection(title: "Liabilities", section: value["liabilities"], currency: currency, end: asAtString)
        ReportsBalanceSection(title: "Equity", section: value["equity"], currency: currency, end: asAtString)
    }
}

/// One balance-sheet section with zero balances left out.
private struct ReportsBalanceSection: View {
    let title: String
    let section: JSONValue?
    let currency: String
    let end: String

    var body: some View {
        let accounts = ReportsJSON.array(section?["accounts"])
            .map { (line: $0, cents: ReportsJSON.decimalCents($0["balance"], currency: currency)) }
            .filter { $0.cents != 0 }
        let total = ReportsJSON.decimalCents(section?["total"], currency: currency)
        ReportsSection(title: title, trailing: ReportsText.count(accounts.count, "account")) {
            ForEach(Array(accounts.enumerated()), id: \.offset) { _, item in
                ReportsAccountRow(
                    accountId: item.line["accountId"]?.stringValue, name: item.line["name"]?.stringValue ?? "Account",
                    code: item.line["code"]?.stringValue, amount: item.cents, currency: currency, start: "2000-01-01", end: end
                )
            }
            ReportsTotalRow(title: "Total \(title.lowercased())", amount: total, currency: currency)
        }
    }
}

// MARK: - Cash flow

/// `GET reports/cash-flow?startDate&endDate` -> flat `operating`, `investing`,
/// `financing` lines (`{ accountName, accountCode, amount }`) with section
/// totals, `netCashFlow`, opening/closing cash and a `reconciliation`.
struct ReportsCashFlowView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var method = "indirect"

    private var query: [String: String?] {
        var query = period.query
        query["method"] = method
        return query
    }

    var body: some View {
        ReportsPage(
            "Cash flow", path: "reports/cash-flow", query: query,
            tilly: "Where did my cash come from and go between \(period.label)?",
            export: ReportsExport(path: "reports/cash-flow", query: query, name: "Cash flow \(period.startString) to \(period.endString)")
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ReportsChoice(options: [("indirect", "From profit"), ("direct", "Receipts and payments")], selection: $method)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let net = ReportsJSON.int(value["netCashChange"] ?? value["netCashFlow"])
        let opening = ReportsJSON.int(value["openingCashBalance"])
        let closing = ReportsJSON.int(value["closingCashBalance"])
        let operating = ReportsJSON.int(value["totalOperating"])
        let investing = ReportsJSON.int(value["totalInvesting"])
        let financing = ReportsJSON.int(value["totalFinancing"])
        ReportsHeadline(
            label: "Net change in cash", amount: net, currency: currency,
            caption: "\(Money.format(opening, currency: currency)) → \(Money.format(closing, currency: currency))"
        )
        ReportsFigures(items: [
            .money("Operating", operating, currency: currency, tint: DTheme.accent),
            .money("Investing", investing, currency: currency, tint: DTheme.special),
            .money("Financing", financing, currency: currency, tint: DTheme.orange),
        ])
        if value["reconciliation.balanced"]?.boolValue == false {
            let difference = ReportsJSON.int(value["reconciliation.difference"])
            ReportsNote(symbol: "exclamationmark.triangle.fill", text: "Differs from your bank accounts' movement by \(Money.format(difference, currency: currency)).", tone: .warning)
        }
        section("Operating activities", lines: ReportsJSON.array(value["operating"]), total: operating, currency: currency)
        section("Investing activities", lines: ReportsJSON.array(value["investing"]), total: investing, currency: currency)
        section("Financing activities", lines: ReportsJSON.array(value["financing"]), total: financing, currency: currency)
        ReportsSection(title: "Cash") {
            ReportsRow(title: "Opening cash", amount: opening, currency: currency)
            ReportsRow(title: "Net change", amount: net, currency: currency)
            ReportsTotalRow(title: "Closing cash", amount: closing, currency: currency)
        }
    }

    private func section(_ title: String, lines: [JSONValue], total: Int, currency: String) -> some View {
        ReportsSection(title: title) {
            if lines.isEmpty {
                ReportsRow(title: "No movements", value: "–")
            }
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                ReportsRow(title: line["accountName"]?.stringValue ?? "Item", code: line["accountCode"]?.stringValue, amount: ReportsJSON.int(line["amount"]), currency: currency)
            }
            ReportsTotalRow(title: "Net cash", amount: total, currency: currency, tone: total < 0 ? .negative : .neutral)
        }
    }
}

// MARK: - Report pack

/// `GET reports/pack?format=json&startDate&endDate` -> `{ statements: [Statement] }`
/// where a Statement is `{ title, periodLabel, columns?, sections: [{ label,
/// rows: [{ code, name, amount | amounts }], subtotal | subtotals }],
/// grandTotal | grandTotals }`. The spreadsheet is the same call without json.
struct ReportsPackView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var selected = 0

    private var query: [String: String?] {
        var query = period.query
        query["format"] = "json"
        return query
    }

    var body: some View {
        ReportsPage(
            "Report pack", path: "reports/pack", query: query,
            tilly: "What should my accountant notice in my report pack for \(period.label)?",
            export: ReportsExport(path: "reports/pack", query: period.query, name: "Report pack \(period.startString) to \(period.endString)", formats: [.xlsx])
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let statements = ReportsJSON.array(value["statements"])
        let currency = ReportsJSON.string(value["currency"]) ?? env.session.currency
        VStack(alignment: .leading, spacing: 10) {
            Text("Four statements for \(period.label), the way your accountant reads them. Export the spreadsheet from the menu.")
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
                .padding(.horizontal, 4)
            ReportsChoice(
                options: statements.enumerated().map { ($0.offset, ReportsStatementView.sentence($0.element["title"]?.stringValue ?? "Statement")) },
                selection: $selected
            )
            .padding(.horizontal, -16)
        }
        if statements.indices.contains(selected) {
            ReportsStatementView(statement: statements[selected], currency: currency)
        }
    }
}

/// Draws any exported Statement shape: sections of rows, multi-column rows as
/// "Debit $X" pairs, and the grand total.
struct ReportsStatementView: View {
    let statement: JSONValue
    let currency: String

    private var columns: [String] { ReportsJSON.array(statement["columns"]).compactMap(\.stringValue) }

    private func value(_ single: JSONValue?, _ multi: JSONValue?) -> (amount: Int?, text: String?) {
        if let multi = multi?.arrayValue {
            let parts = multi.enumerated().compactMap { index, amount -> String? in
                let cents = ReportsJSON.int(amount)
                guard cents != 0 else { return nil }
                let label = columns.indices.contains(index) ? columns[index] : ""
                return "\(label) \(Money.format(cents, currency: currency))".trimmingCharacters(in: .whitespaces)
            }
            return (nil, parts.isEmpty ? Money.format(0, currency: currency) : parts.joined(separator: " · "))
        }
        return (single?.intValue ?? 0, nil)
    }

    /// "Profit and Loss" -> "Profit and loss".
    static func sentence(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst().lowercased()
    }

    /// "As at 2026-10-12" -> "As at 12 Oct 2026".
    static func dates(_ text: String) -> String {
        text.split(separator: " ").map { word in
            let part = String(word)
            return part.count == 10 && DubblDate.parseDay(part) != nil ? DubblDate.display(part) : part
        }.joined(separator: " ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 3) {
                Text(Self.sentence(statement["title"]?.stringValue ?? "Statement"))
                    .displayFont(22)
                    .foregroundStyle(DTheme.ink)
                Text(Self.dates(statement["periodLabel"]?.stringValue ?? ""))
                    .font(.system(size: 13.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .padding(.horizontal, 4)
            ForEach(Array(ReportsJSON.array(statement["sections"]).enumerated()), id: \.offset) { _, section in
                let rows = ReportsJSON.array(section["rows"]).filter { row in
                    if let amounts = row["amounts"]?.arrayValue { return amounts.contains { ReportsJSON.int($0) != 0 } }
                    return ReportsJSON.int(row["amount"]) != 0 || row["bold"]?.boolValue == true
                }
                ReportsSection(title: Self.sentence(section["label"]?.stringValue ?? ""), trailing: ReportsText.count(rows.count, "line")) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        let shown = value(row["amount"], row["amounts"])
                        ReportsRow(
                            title: row["name"]?.stringValue ?? "", code: row["code"]?.stringValue, amount: shown.amount, currency: currency,
                            value: shown.text, bold: row["bold"]?.boolValue == true
                        )
                    }
                    if section["subtotal"] != nil || section["subtotals"] != nil {
                        let total = value(section["subtotal"], section["subtotals"])
                        if let amount = total.amount {
                            ReportsTotalRow(title: "Total", amount: amount, currency: currency)
                        } else {
                            ReportsRow(title: "Total", value: total.text, bold: true)
                        }
                    }
                }
            }
            if statement["grandTotal"] != nil || statement["grandTotals"] != nil {
                let total = value(statement["grandTotal"], statement["grandTotals"])
                CardStack {
                    if let amount = total.amount {
                        ReportsTotalRow(title: "Bottom line", amount: amount, currency: currency)
                    } else {
                        ReportsRow(title: "Bottom line", value: total.text, bold: true)
                    }
                }
            }
        }
    }
}

// MARK: - Comparative balance sheet

/// The balance sheet at today and at past month ends side by side:
/// `GET reports/balance-sheet?asAt&compareDate=a,b` adds `dates` and per-date
/// `balances`/`totals` (decimal strings).
struct ReportsComparativeView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var months = 3

    private var dates: [Date] {
        let today = Date.now
        return [today] + (1 ..< months).map { ReportsDates.monthEnd(before: today, monthsBack: $0) }
    }

    private var query: [String: String?] {
        let strings = dates.map(DubblDate.string)
        return ["asAt": strings.first, "compareDate": strings.dropFirst().joined(separator: ",")]
    }

    var body: some View {
        ReportsPage(
            "Comparative balance sheet", path: "reports/balance-sheet", query: query,
            tilly: "What changed in my balance sheet over the last \(months) months?",
            export: ReportsExport(path: "reports/balance-sheet", query: query, name: "Comparative balance sheet")
        ) {
            ReportsChoice(options: [(3, "3 months"), (6, "6 months"), (12, "12 months")], selection: $months)
        } content: { value in
            content(value)
        }
    }

    private func label(_ string: String, isFirst: Bool) -> String {
        if isFirst { return "Now" }
        return DubblDate.parseDay(string)?.formatted(.dateTime.month(.abbreviated)) ?? string
    }

    /// A section's total per date, in cents.
    private static func totals(_ value: JSONValue, _ key: String, currency: String) -> [Int] {
        let list = ReportsJSON.array(value["\(key).totals"])
        if list.isEmpty { return [ReportsJSON.decimalCents(value["\(key).total"], currency: currency)] }
        return list.map { ReportsJSON.decimalCents($0, currency: currency) }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let dateStrings = ReportsJSON.array(value["dates"]).compactMap(\.stringValue)
        let columns = dateStrings.isEmpty ? [ReportsJSON.string(value["asAt"]) ?? DubblDate.string(.now)] : dateStrings
        let oldest = columns.count - 1
        let totals = { (key: String) in Self.totals(value, key, currency: currency) }
        let assets = totals("assets"), liabilities = totals("liabilities"), equity = totals("equity")
        let netNow = (assets.first ?? 0) - (liabilities.first ?? 0)
        let netThen = (assets.last ?? 0) - (liabilities.last ?? 0)
        ReportsHeadline(
            label: "Net assets now", amount: netNow, currency: currency,
            caption: oldest > 0 ? "\(ReportsText.signedMoney(netNow - netThen, currency: currency)) since \(DubblDate.display(columns[oldest]))" : nil,
            captionTone: netNow >= netThen ? .positive : .negative
        )
        let order = Array(columns.indices.reversed())
        ReportsColumnChart(
            points: order.enumerated().flatMap { position, index in
                [
                    ReportsChartPoint(label: label(columns[index], isFirst: index == 0), series: "Assets", value: ReportsJSON.at(assets, index), order: position),
                    ReportsChartPoint(label: label(columns[index], isFirst: index == 0), series: "Liabilities", value: ReportsJSON.at(liabilities, index), order: position),
                ]
            },
            line: order.enumerated().map { position, index in
                ReportsChartPoint(label: label(columns[index], isFirst: index == 0), series: "Equity", value: ReportsJSON.at(equity, index), order: position)
            },
            currency: currency,
            colors: ["Assets": DTheme.accent, "Liabilities": DTheme.orange, "Equity": DTheme.special]
        )
        ForEach(["assets", "liabilities", "equity"], id: \.self) { key in
            let accounts = ReportsJSON.array(value["\(key).accounts"]).compactMap { line -> (line: JSONValue, values: [Int])? in
                let values = (line["balances"]?.arrayValue ?? [line["balance"] ?? .null]).map { ReportsJSON.decimalCents($0, currency: currency) }
                return values.contains { $0 != 0 } ? (line, values) : nil
            }
            let sectionTotals = totals(key)
            ReportsSection(title: key.capitalized, trailing: Money.short(sectionTotals.first ?? 0, currency: currency)) {
                ForEach(Array(accounts.enumerated()), id: \.offset) { _, item in
                    let change = (item.values.first ?? 0) - (item.values.last ?? 0)
                    ReportsAccountRow(
                        accountId: item.line["accountId"]?.stringValue, name: item.line["name"]?.stringValue ?? "Account", code: item.line["code"]?.stringValue,
                        subtitle: oldest > 0 ? "\(ReportsText.signedMoney(change, currency: currency)) since \(DubblDate.short(columns[oldest]))" : nil,
                        amount: item.values.first ?? 0, currency: currency, start: "2000-01-01", end: columns[0]
                    )
                }
                ReportsTotalRow(title: "Total \(key)", amount: sectionTotals.first ?? 0, currency: currency)
            }
        }
    }
}


// MARK: - Trial balance

/// `GET reports/trial-balance?asAt` -> `{ accounts: [{ accountId, code, name,
/// type, balance }] }`; `balance` is a natural-signed decimal string, so the
/// debit or credit side is worked out from the account type here.
struct ReportsTrialBalanceView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var asAt = Date.now

    private var asAtString: String { DubblDate.string(asAt) }
    private static let types: [(key: String, title: String)] = [("asset", "Assets"), ("liability", "Liabilities"), ("equity", "Equity"), ("revenue", "Revenue"), ("expense", "Expenses")]

    var body: some View {
        ReportsPage(
            "Trial balance", path: "reports/trial-balance", query: ["asAt": asAtString],
            tilly: "Check my trial balance as at \(ReportsDates.day(asAt)). Anything unusual?",
            export: ReportsExport(path: "reports/trial-balance", query: ["asAt": asAtString], name: "Trial balance \(asAtString)")
        ) {
            ReportsAsAtBar(date: $asAt)
        } content: { value in
            content(value)
        }
    }

    /// (debit, credit) in cents for an account's natural-signed balance.
    private static func sides(_ balance: Int, type: String) -> (Int, Int) {
        let debitNormal = type == "asset" || type == "expense"
        if debitNormal { return balance >= 0 ? (balance, 0) : (0, -balance) }
        return balance >= 0 ? (0, balance) : (-balance, 0)
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let accounts = ReportsJSON.array(value["accounts"]).compactMap { line -> (line: JSONValue, type: String, debit: Int, credit: Int)? in
            let type = line["type"]?.stringValue ?? ""
            let cents = ReportsJSON.decimalCents(line["balance"], currency: currency)
            guard cents != 0 else { return nil }
            let (debit, credit) = Self.sides(cents, type: type)
            return (line, type, debit, credit)
        }
        let debits = accounts.reduce(0) { $0 + $1.debit }
        let credits = accounts.reduce(0) { $0 + $1.credit }
        ReportsHeadline(
            label: "Total debits", amount: debits, currency: currency,
            caption: debits == credits ? "Balanced: credits match · as at \(ReportsDates.day(asAt))" : "Out by \(Money.format(debits - credits, currency: currency))",
            captionTone: debits == credits ? .positive : .negative
        )
        ReportsFigures(items: [
            .money("Debits", debits, currency: currency, tint: DTheme.accent),
            .money("Credits", credits, currency: currency, tint: DTheme.orange),
            LedgerTotals.Item(label: "Accounts", value: "\(accounts.count)", detail: "with a balance"),
        ])
        ForEach(Self.types, id: \.key) { type, title in
            let lines = accounts.filter { $0.type == type }
            if !lines.isEmpty {
                ReportsSection(title: title, trailing: ReportsText.count(lines.count, "account")) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, item in
                        let id = ReportsJSON.drillableAccount(item.line["accountId"]?.stringValue)
                        let row = ReportsRow(
                            title: item.line["name"]?.stringValue ?? "Account", code: item.line["code"]?.stringValue,
                            value: item.debit > 0 ? "\(Money.format(item.debit, currency: currency)) Dr" : "\(Money.format(item.credit, currency: currency)) Cr",
                            chevron: id != nil
                        )
                        if let id {
                            NavigationLink {
                                ReportsAccountView(accountId: id, name: item.line["name"]?.stringValue ?? "Account", code: item.line["code"]?.stringValue, start: "2000-01-01", end: asAtString)
                            } label: { row }
                                .buttonStyle(RowPressStyle())
                        } else {
                            row
                        }
                    }
                }
            }
        }
    }
}

// MARK: - General ledger

/// `GET reports/general-ledger?startDate&endDate&limit=1` -> `{ accounts:
/// [{ accountId, accountName, accountCode, accountType, totalEntries,
/// totalDebit, totalCredit, balance }] }`. Each account opens its lines.
struct ReportsGeneralLedgerView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var search = ""

    private static let types: [(key: String, title: String)] = [("asset", "Assets"), ("liability", "Liabilities"), ("equity", "Equity"), ("revenue", "Revenue"), ("expense", "Expenses")]

    private var query: [String: String?] {
        var query = period.query
        query["limit"] = "1"
        return query
    }

    var body: some View {
        ReportsPage(
            "General ledger", path: "reports/general-ledger", query: query,
            tilly: "Summarize the activity in my general ledger for \(period.label).",
            export: ReportsExport(path: "reports/general-ledger", query: period.query, name: "General ledger \(period.startString) to \(period.endString)")
        ) {
            VStack(spacing: 10) {
                ReportsPeriodBar(period: $period)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(DTheme.inkTertiary)
                    TextField("Find an account", text: $search)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !search.isEmpty {
                        Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(DTheme.inkTertiary) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear search")
                    }
                }
                .font(.system(size: 15.5))
                .padding(.horizontal, 14)
                .frame(height: 40)
                .background(DTheme.field, in: Capsule())
                .padding(.horizontal, 16)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let all = ReportsJSON.array(value["accounts"])
        let term = search.trimmingCharacters(in: .whitespaces)
        let accounts = term.isEmpty ? all : all.filter { line in
            [line["accountName"]?.stringValue, line["accountCode"]?.stringValue].compactMap { $0 }.contains { $0.localizedCaseInsensitiveContains(term) }
        }
        let debits = all.reduce(0) { $0 + ReportsJSON.int($1["totalDebit"]) }
        let lines = all.reduce(0) { $0 + ReportsJSON.int($1["totalEntries"]) }
        if term.isEmpty {
            ReportsHeadline(label: "Posted in \(period.label)", amount: debits, currency: currency, caption: "\(ReportsText.count(lines, "line")) across \(ReportsText.count(all.count, "account"))")
        }
        if accounts.isEmpty {
            ReportsEmpty(symbol: "book.closed", title: term.isEmpty ? "Nothing posted" : "No matching accounts", message: term.isEmpty ? "No journal lines in this period." : nil)
        }
        ForEach(Self.types, id: \.key) { type, title in
            let group = accounts.filter { $0["accountType"]?.stringValue == type }
            if !group.isEmpty {
                ReportsSection(title: title, trailing: ReportsText.count(group.count, "account")) {
                    ForEach(Array(group.enumerated()), id: \.offset) { _, line in
                        let count = ReportsJSON.int(line["totalEntries"])
                        ReportsAccountRow(
                            accountId: line["accountId"]?.stringValue, name: line["accountName"]?.stringValue ?? "Account", code: line["accountCode"]?.stringValue,
                            subtitle: "\(ReportsText.count(count, "line")) · Dr \(Money.short(ReportsJSON.int(line["totalDebit"]), currency: currency)) · Cr \(Money.short(ReportsJSON.int(line["totalCredit"]), currency: currency))",
                            amount: ReportsJSON.int(line["balance"]), currency: currency, start: period.startString, end: period.endString
                        )
                    }
                }
            }
        }
    }
}
