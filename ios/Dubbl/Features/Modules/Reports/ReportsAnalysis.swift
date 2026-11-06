import SwiftUI

// Profit and spending: tracking categories, period comparison, budget vs
// actual, expense analytics, profitability, vendor spend and sales breakdowns.

// MARK: - Tracking

/// `GET reports/tracking-category?startDate&endDate&dimension=costCenterId|projectId&mode=pnl`
/// -> `{ columns: [{ key, label, dimensionValue }], sections: [{ label, accounts:
/// [{ accountId, accountCode, accountName, amounts, total }], totals, total }],
/// netIncome: { byColumn, total } }`.
struct ReportsTrackingView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var dimension = "costCenterId"
    @State private var column = "all"

    private var query: [String: String?] {
        var query = period.query
        query["dimension"] = dimension
        query["mode"] = "pnl"
        return query
    }

    var body: some View {
        ReportsPage(
            "Tracking", path: "reports/tracking-category", query: query,
            tilly: "Which \(dimension == "projectId" ? "projects" : "cost centers") made or lost money in \(period.label)?",
            export: ReportsExport(path: "reports/tracking-category", query: query, name: "Tracking \(period.startString) to \(period.endString)")
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ReportsChoice(options: [("costCenterId", "Cost centers"), ("projectId", "Projects")], selection: $dimension)
            }
        } content: { value in
            content(value)
        }
        .onChange(of: dimension) { _, _ in column = "all" }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let columns = ReportsJSON.array(value["columns"])
        let index = columns.firstIndex { $0["key"]?.stringValue == column }
        let byColumn = ReportsJSON.array(value["netIncome.byColumn"]).map { ReportsJSON.int($0) }
        let net = index.map { ReportsJSON.at(byColumn, $0) } ?? ReportsJSON.int(value["netIncome.total"])
        let noun = dimension == "projectId" ? "project" : "cost center"
        if columns.isEmpty {
            ReportsEmpty(symbol: "tag", title: "Nothing tagged", message: "Tag invoice, bill and journal lines with a \(noun) to compare them here.")
        } else {
            ReportsChoice(
                options: [("all", "All")] + columns.map { ($0["key"]?.stringValue ?? "", $0["label"]?.stringValue ?? "Unassigned") },
                selection: $column
            )
            .padding(.horizontal, -16)
            ReportsHeadline(
                label: index.map { "Net income · \(columns[$0]["label"]?.stringValue ?? "")" } ?? "Net income · every \(noun)",
                amount: net, currency: currency, caption: period.label
            )
            if index == nil {
                let peak = max(byColumn.map(abs).max() ?? 0, 1)
                ReportsSection(title: "Net income by \(noun)") {
                    ForEach(Array(columns.enumerated()), id: \.offset) { offset, item in
                        let amount = ReportsJSON.at(byColumn, offset)
                        Button {
                            withAnimation(.snappy) { column = item["key"]?.stringValue ?? "all" }
                        } label: {
                            ReportsBarRow(
                                title: item["label"]?.stringValue ?? "Unassigned", amount: amount, currency: currency,
                                share: Double(abs(amount)) / Double(peak), tint: amount < 0 ? DTheme.negative : DTheme.positive, chevron: true
                            )
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
            ForEach(Array(ReportsJSON.array(value["sections"]).enumerated()), id: \.offset) { _, section in
                let title = section["label"]?.stringValue ?? ""
                let rows = ReportsJSON.array(section["accounts"]).map { line in
                    (line: line, amount: index.map { ReportsJSON.at(ReportsJSON.array(line["amounts"]).map { ReportsJSON.int($0) }, $0) } ?? ReportsJSON.int(line["total"]))
                }.filter { $0.amount != 0 }
                let total = index.map { ReportsJSON.at(ReportsJSON.array(section["totals"]).map { ReportsJSON.int($0) }, $0) } ?? ReportsJSON.int(section["total"])
                ReportsSection(title: title, trailing: Money.short(total, currency: currency)) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        ReportsAccountRow(
                            accountId: row.line["accountId"]?.stringValue, name: row.line["accountName"]?.stringValue ?? "Account",
                            code: row.line["accountCode"]?.stringValue, amount: row.amount, currency: currency,
                            start: period.startString, end: period.endString,
                            dimension: index.map { (dimension, columns[$0]["dimensionValue"]?.stringValue ?? "none") }
                        )
                    }
                    ReportsTotalRow(title: "Total \(title.lowercased())", amount: total, currency: currency)
                }
            }
        }
    }
}

// MARK: - P&L comparison

/// `GET reports/pnl-comparison?compare=monthly|quarterly|yearly` -> `{ periods:
/// [{ label, startDate, endDate, totalRevenue, totalExpenses, netIncome,
/// revenueChangePct, expensesChangePct, netIncomeChangePct }] }`, oldest first.
struct ReportsPnLComparisonView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var compare = "monthly"

    var body: some View {
        ReportsPage(
            "P&L comparison", path: "reports/pnl-comparison", query: ["compare": compare],
            tilly: "Compare my profit across recent \(compare == "monthly" ? "months" : compare == "quarterly" ? "quarters" : "years"). What's the trend?"
        ) {
            ReportsChoice(options: [("monthly", "Months"), ("quarterly", "Quarters"), ("yearly", "Years")], selection: $compare)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let periods = ReportsJSON.array(value["periods"])
        if let latest = periods.last {
            let change = ReportsJSON.double(latest["netIncomeChangePct"])
            ReportsHeadline(
                label: "Net income · \(latest["label"]?.stringValue ?? "")",
                amount: ReportsJSON.int(latest["netIncome"]), currency: currency,
                caption: periods.count > 1 ? "\(ReportsText.change(change)) vs \(periods[periods.count - 2]["label"]?.stringValue ?? "before")" : nil,
                captionTone: (change ?? 0) >= 0 ? .positive : .negative
            )
            ReportsColumnChart(
                points: periods.enumerated().flatMap { offset, period in
                    let label = Self.short(period["label"]?.stringValue ?? "")
                    return [
                        ReportsChartPoint(label: label, series: "Revenue", value: ReportsJSON.int(period["totalRevenue"]), order: offset),
                        ReportsChartPoint(label: label, series: "Expenses", value: ReportsJSON.int(period["totalExpenses"]), order: offset),
                    ]
                },
                line: periods.enumerated().map { offset, period in
                    ReportsChartPoint(label: Self.short(period["label"]?.stringValue ?? ""), series: "Net", value: ReportsJSON.int(period["netIncome"]), order: offset)
                },
                currency: currency,
                colors: ["Revenue": DTheme.chartPrimary, "Expenses": DTheme.chartSecondary, "Net": DTheme.positive]
            )
            ReportsSection(title: "Each period", trailing: "Newest first") {
                ForEach(Array(periods.reversed().enumerated()), id: \.offset) { offset, period in
                    let net = ReportsJSON.int(period["netIncome"])
                    let pct = ReportsJSON.double(period["netIncomeChangePct"])
                    ReportsRow(
                        title: period["label"]?.stringValue ?? "",
                        subtitle: "In \(Money.short(ReportsJSON.int(period["totalRevenue"]), currency: currency)) · out \(Money.short(ReportsJSON.int(period["totalExpenses"]), currency: currency))"
                            + (offset < periods.count - 1 ? " · \(ReportsText.change(pct))" : ""),
                        amount: net, currency: currency
                    )
                }
            }
        } else {
            ReportsEmpty(symbol: "chart.bar.xaxis", title: "Nothing to compare", message: "Post some income and expenses first.")
        }
    }

    /// "Oct 2026" -> "Oct", "Q3 2026" -> "Q3"; years stay whole.
    private static func short(_ label: String) -> String {
        let parts = label.split(separator: " ")
        return parts.count == 2 ? String(parts[0]) : label
    }
}

// MARK: - Budget vs actual

/// `GET budgets?limit=100` for the picker, then `GET reports/budget-vs-actual?budgetId`
/// -> `{ budget, comparisons: [{ accountId, accountName, accountCode, budgeted,
/// actual, variance, variancePct, projected }], totalBudgeted, totalActual,
/// totalVariance, totalBurnRate, daysElapsed, daysRemaining, totalDays }`.
struct ReportsBudgetView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var budgets = ReportsLoader()
    @State private var budgetId = ""

    private var budgetList: [JSONValue] { ReportsJSON.array(budgets.value?["data"]) }

    var body: some View {
        ReportsPage(
            "Budget vs actual", path: "reports/budget-vs-actual", query: budgetId.isEmpty ? [:] : ["budgetId": budgetId],
            tilly: "Where am I over or under budget, and what should I watch?"
        ) {
            if budgetList.count > 1 {
                ReportsChoice(options: budgetList.map { ($0.recordID ?? "", $0["name"]?.stringValue ?? "Budget") }, selection: $budgetId)
            }
        } content: { value in
            content(value)
        }
        .task {
            await budgets.load(env.api, "budgets", query: ["limit": "100"])
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        if value["budget"]?.isNull ?? true {
            ReportsEmpty(symbol: "target", title: "No budget yet", message: "Set a budget for the year on the web, then track it here.")
        } else {
            let budgeted = ReportsJSON.int(value["totalBudgeted"])
            let actual = ReportsJSON.int(value["totalActual"])
            let projected = ReportsJSON.int(value["totalBurnRate"])
            let elapsed = ReportsJSON.int(value["daysElapsed"])
            let total = max(ReportsJSON.int(value["totalDays"]), 1)
            let over = projected > budgeted
            ReportsHeadline(
                label: "Spent · \(value["budget.name"]?.stringValue ?? "Budget")", amount: actual, currency: currency,
                caption: "of \(Money.format(budgeted, currency: currency)) · \(ReportsText.count(ReportsJSON.int(value["daysRemaining"]), "day")) left"
            )
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .leading) {
                    ReportsMeter(fraction: budgeted > 0 ? Double(actual) / Double(budgeted) : 0, tint: actual > budgeted ? DTheme.negative : DTheme.accent, height: 10)
                    GeometryReader { proxy in
                        Rectangle().fill(DTheme.ink.opacity(0.55)).frame(width: 2, height: 16)
                            .offset(x: proxy.size.width * CGFloat(elapsed) / CGFloat(total) - 1, y: -3)
                    }
                    .frame(height: 10)
                }
                Text("The mark is today: \(Int((Double(elapsed) / Double(total) * 100).rounded()))% of the way through \(DubblDate.short(value["budget.startDate"]?.stringValue)) – \(DubblDate.display(value["budget.endDate"]?.stringValue)).")
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .dubblCard(padding: 16)
            ReportsFigures(items: [
                .money("Left", budgeted - actual, currency: currency, tint: DTheme.positive),
                .money("On pace for", projected, currency: currency, detail: over ? "over budget" : "within budget", tint: over ? DTheme.negative : DTheme.accent),
            ])
            let lines = ReportsJSON.array(value["comparisons"]).sorted {
                Double(ReportsJSON.int($0["actual"])) / Double(max(ReportsJSON.int($0["budgeted"]), 1)) > Double(ReportsJSON.int($1["actual"])) / Double(max(ReportsJSON.int($1["budgeted"]), 1))
            }
            ReportsSection(title: "By account", trailing: "Most used first") {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    let lineBudget = ReportsJSON.int(line["budgeted"])
                    let lineActual = ReportsJSON.int(line["actual"])
                    let variance = ReportsJSON.int(line["variance"])
                    ReportsAccountLink(
                        accountId: line["accountId"]?.stringValue, name: line["accountName"]?.stringValue ?? "Account", code: line["accountCode"]?.stringValue,
                        start: value["budget.startDate"]?.stringValue ?? "", end: value["budget.endDate"]?.stringValue ?? ""
                    ) {
                        ReportsBarRow(
                            title: line["accountName"]?.stringValue ?? "Account",
                            subtitle: "\(Money.short(lineActual, currency: currency)) of \(Money.short(lineBudget, currency: currency)) · on pace for \(Money.short(ReportsJSON.int(line["projected"]), currency: currency))",
                            amount: variance, currency: currency,
                            share: lineBudget > 0 ? Double(lineActual) / Double(lineBudget) : 0,
                            tint: lineActual > lineBudget ? DTheme.negative : DTheme.accent,
                            trailingNote: variance >= 0 ? "left" : "over"
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Expense analytics

/// `GET reports/expense-analytics?startDate&endDate` -> `{ totalExpenses,
/// monthlyAverage, categories: [{ accountId, accountName, accountCode, total,
/// transactions, percentage }], monthlyTrend: [{ month, total }] }`.
struct ReportsExpenseAnalyticsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    var body: some View {
        ReportsPage(
            "Expense analytics", path: "reports/expense-analytics", query: period.query,
            tilly: "Where is my money going in \(period.label)? Anything I could cut?"
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let total = ReportsJSON.int(value["totalExpenses"])
        let categories = ReportsJSON.array(value["categories"])
        let trend = ReportsJSON.array(value["monthlyTrend"])
        ReportsHeadline(label: "Spent · \(period.label)", amount: total, currency: currency, caption: "About \(Money.format(ReportsJSON.int(value["monthlyAverage"]), currency: currency)) a month")
        if trend.count > 1 {
            ReportsColumnChart(
                points: trend.enumerated().map { offset, month in
                    ReportsChartPoint(label: ReportsDates.month(month["month"]?.stringValue ?? ""), series: "Spending", value: ReportsJSON.int(month["total"]), order: offset)
                },
                currency: currency, colors: ["Spending": DTheme.chartSecondary], height: 150
            )
        }
        if categories.isEmpty {
            ReportsEmpty(symbol: "chart.pie", title: "No spending", message: "No expenses were posted in this period.")
        } else {
            let peak = max(categories.map { ReportsJSON.int($0["total"]) }.max() ?? 1, 1)
            ReportsSection(title: "By category", trailing: ReportsText.count(categories.count, "category", "categories")) {
                ForEach(Array(categories.enumerated()), id: \.offset) { _, category in
                    let name = category["accountName"]?.stringValue ?? "Category"
                    ReportsAccountLink(accountId: category["accountId"]?.stringValue, name: name, code: category["accountCode"]?.stringValue, start: period.startString, end: period.endString) {
                        ReportsBarRow(
                            title: name,
                            subtitle: ReportsText.count(ReportsJSON.int(category["transactions"]), "transaction"),
                            amount: ReportsJSON.int(category["total"]), currency: currency,
                            share: Double(ReportsJSON.int(category["total"])) / Double(peak), tint: DTheme.orange,
                            trailingNote: ReportsText.percent(ReportsJSON.double(category["percentage"]))
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Profitability

/// `GET reports/profitability?startDate&endDate&groupBy=contact|project` ->
/// `{ entries: [{ contactId|projectId, contactName|projectName, revenue, costs,
/// profit, margin, ... }], totalRevenue, totalCosts, totalProfit, overallMargin }`.
struct ReportsProfitabilityView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var groupBy = "contact"

    private var query: [String: String?] {
        var query = period.query
        query["groupBy"] = groupBy
        return query
    }

    var body: some View {
        ReportsPage(
            "Profitability", path: "reports/profitability", query: query,
            tilly: "Which \(groupBy == "project" ? "projects" : "customers") are most and least profitable in \(period.label)?"
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ReportsChoice(options: [("contact", "By customer"), ("project", "By project")], selection: $groupBy)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let entries = ReportsJSON.array(value["entries"])
        let profit = ReportsJSON.int(value["totalProfit"])
        ReportsHeadline(
            label: "Profit · \(period.label)", amount: profit, currency: currency,
            caption: "\(ReportsText.percent(ReportsJSON.double(value["overallMargin"]))) overall margin"
        )
        ReportsFigures(items: [
            .money("Revenue", ReportsJSON.int(value["totalRevenue"]), currency: currency, tint: DTheme.accent),
            .money("Costs", ReportsJSON.int(value["totalCosts"]), currency: currency, tint: DTheme.orange),
        ])
        if entries.isEmpty {
            ReportsEmpty(symbol: "chart.line.uptrend.xyaxis", title: "Nothing to show", message: groupBy == "project" ? "Tag invoice and bill lines with a project to see its profit." : "No invoices in this period.")
        } else {
            let peak = max(entries.map { abs(ReportsJSON.int($0["profit"])) }.max() ?? 1, 1)
            ReportsSection(title: groupBy == "project" ? "Projects" : "Customers", trailing: "Most profitable first") {
                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                    row(entry, currency: currency, peak: peak)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: JSONValue, currency: String, peak: Int) -> some View {
        let profit = ReportsJSON.int(entry["profit"])
        let minutes = ReportsJSON.int(entry["totalMinutes"])
        let facts = ["In \(Money.short(ReportsJSON.int(entry["revenue"]), currency: currency))", "costs \(Money.short(ReportsJSON.int(entry["costs"]), currency: currency))"]
            + (minutes > 0 ? ["\(minutes / 60)h logged"] : [])
        let bar = ReportsBarRow(
            title: entry["contactName"]?.stringValue ?? entry["projectName"]?.stringValue ?? "Unknown",
            subtitle: facts.joined(separator: " · "),
            amount: profit, currency: currency,
            share: Double(abs(profit)) / Double(peak),
            tint: profit < 0 ? DTheme.negative : DTheme.positive,
            trailingNote: "\(ReportsText.percent(ReportsJSON.double(entry["margin"]))) margin",
            chevron: entry["contactId"] != nil || (entry["projectId"] != nil && RecordCatalog.spec("projects") != nil)
        )
        if let contactId = entry["contactId"]?.stringValue {
            ReportsDocumentLink(kind: .contact, id: contactId) { bar }
        } else if let projectId = entry["projectId"]?.stringValue, RecordCatalog.spec("projects") != nil {
            NavigationLink(value: RecordRoute(spec: "projects", id: projectId)) { bar }
                .buttonStyle(RowPressStyle())
        } else {
            bar
        }
    }
}

// MARK: - Vendor spend

/// `GET reports/vendor-spend?startDate&endDate` -> `{ totalSpend, vendorCount,
/// vendors: [{ contactId, contactName, totalSpend, billCount, avgBillAmount,
/// lastBillDate, percentage }], monthlyTrend: [{ contactId, month, total }] }`.
struct ReportsVendorSpendView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    var body: some View {
        ReportsPage(
            "Vendor spend", path: "reports/vendor-spend", query: period.query,
            tilly: "Who are my biggest suppliers in \(period.label), and is spend with any of them growing?"
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let vendors = ReportsJSON.array(value["vendors"])
        let names = Dictionary(vendors.compactMap { vendor in vendor["contactId"]?.stringValue.map { ($0, vendor["contactName"]?.stringValue ?? "Supplier") } }, uniquingKeysWith: { a, _ in a })
        let trend = ReportsJSON.array(value["monthlyTrend"])
        let months = Array(Set(trend.compactMap { $0["month"]?.stringValue })).sorted()
        ReportsHeadline(
            label: "Billed by suppliers · \(period.label)", amount: ReportsJSON.int(value["totalSpend"]), currency: currency,
            caption: ReportsText.count(ReportsJSON.int(value["vendorCount"]), "supplier")
        )
        if months.count > 1 {
            ReportsColumnChart(
                points: trend.map { point in
                    let month = point["month"]?.stringValue ?? ""
                    return ReportsChartPoint(
                        label: ReportsDates.month(month), series: names[point["contactId"]?.stringValue ?? ""] ?? "Other",
                        value: ReportsJSON.int(point["total"]), order: months.firstIndex(of: month) ?? 0
                    )
                },
                currency: currency, stacked: true, height: 160
            )
        }
        if vendors.isEmpty {
            ReportsEmpty(symbol: "cart", title: "No bills", message: "Bills from suppliers in this period show up here.")
        } else {
            let peak = max(vendors.map { ReportsJSON.int($0["totalSpend"]) }.max() ?? 1, 1)
            ReportsSection(title: "Suppliers", trailing: "Biggest first") {
                ForEach(Array(vendors.enumerated()), id: \.offset) { _, vendor in
                    ReportsDocumentLink(kind: .contact, id: vendor["contactId"]?.stringValue) {
                        ReportsBarRow(
                            title: vendor["contactName"]?.stringValue ?? "Supplier",
                            subtitle: "\(ReportsText.count(ReportsJSON.int(vendor["billCount"]), "bill")) · avg \(Money.short(ReportsJSON.int(vendor["avgBillAmount"]), currency: currency)) · last \(DubblDate.short(vendor["lastBillDate"]?.stringValue))",
                            amount: ReportsJSON.int(vendor["totalSpend"]), currency: currency,
                            share: Double(ReportsJSON.int(vendor["totalSpend"])) / Double(peak), tint: DTheme.orange,
                            trailingNote: ReportsText.percent(ReportsJSON.double(vendor["percentage"])), chevron: true
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Sales by customer

/// `GET reports/sales-by-customer?startDate&endDate` -> `{ customers: [{ contactId,
/// contactName, net, tax, gross, invoiceCount }], totals }`.
struct ReportsSalesByCustomerView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    var body: some View {
        ReportsPage(
            "Sales by customer", path: "reports/sales-by-customer", query: period.query,
            tilly: "Who are my biggest customers in \(period.label), and how concentrated is my revenue?",
            export: ReportsExport(path: "reports/sales-by-customer", query: period.query, name: "Sales by customer \(period.startString) to \(period.endString)")
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let customers = ReportsJSON.array(value["customers"])
        let net = ReportsJSON.int(value["totals.net"])
        ReportsHeadline(
            label: "Net sales · \(period.label)", amount: net, currency: currency,
            caption: "\(ReportsText.count(ReportsJSON.int(value["totals.invoiceCount"]), "invoice")) · \(Money.format(ReportsJSON.int(value["totals.tax"]), currency: currency)) tax"
        )
        if let top = customers.first, net > 0 {
            ReportsNote(
                symbol: "person.crop.circle.badge.exclamationmark",
                text: "\(top["contactName"]?.stringValue ?? "Your top customer") is \(ReportsText.percent(Double(ReportsJSON.int(top["net"])) / Double(net) * 100, digits: 0)) of sales.",
                tone: Double(ReportsJSON.int(top["net"])) / Double(net) > 0.4 ? .warning : .neutral
            )
        }
        if customers.isEmpty {
            ReportsEmpty(symbol: "person.2", title: "No sales", message: "Invoices you send in this period show up here.")
        } else {
            ReportsSection(title: "Customers", trailing: "Biggest first") {
                ForEach(Array(customers.enumerated()), id: \.offset) { _, customer in
                    ReportsDocumentLink(kind: .contact, id: customer["contactId"]?.stringValue) {
                        ReportsBarRow(
                            title: customer["contactName"]?.stringValue ?? "Customer",
                            subtitle: "\(ReportsText.count(ReportsJSON.int(customer["invoiceCount"]), "invoice")) · \(Money.short(ReportsJSON.int(customer["gross"]), currency: currency)) with tax",
                            amount: ReportsJSON.int(customer["net"]), currency: currency,
                            share: net > 0 ? Double(ReportsJSON.int(customer["net"])) / Double(net) : 0,
                            trailingNote: net > 0 ? ReportsText.percent(Double(ReportsJSON.int(customer["net"])) / Double(net) * 100) : nil,
                            chevron: customer["contactId"]?.stringValue != nil
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Sales by item

/// `GET reports/sales-by-item?startDate&endDate` -> `{ items: [{ itemId, itemCode,
/// itemName, quantity (×100), net, tax, gross, lineCount }], totals }`.
struct ReportsSalesByItemView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear

    var body: some View {
        ReportsPage(
            "Sales by item", path: "reports/sales-by-item", query: period.query,
            tilly: "What are my best-selling products and services in \(period.label)?",
            export: ReportsExport(path: "reports/sales-by-item", query: period.query, name: "Sales by item \(period.startString) to \(period.endString)")
        ) {
            ReportsPeriodBar(period: $period)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let items = ReportsJSON.array(value["items"])
        let net = ReportsJSON.int(value["totals.net"])
        ReportsHeadline(
            label: "Net sales · \(period.label)", amount: net, currency: currency,
            caption: "\(ReportsText.count(items.count, "item")) · \(ReportsText.count(ReportsJSON.int(value["totals.lineCount"]), "line"))"
        )
        if items.isEmpty {
            ReportsEmpty(symbol: "shippingbox", title: "No sales", message: "Invoice lines in this period show up here.")
        } else {
            ReportsSection(title: "Items", trailing: "Biggest first") {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    let quantity = Double(ReportsJSON.int(item["quantity"])) / 100
                    let code = item["itemCode"]?.stringValue
                    ReportsBarRow(
                        title: [code, item["itemName"]?.stringValue ?? "Item"].compactMap { $0 }.joined(separator: " · "),
                        subtitle: "\(quantity.formatted(.number.precision(.fractionLength(0 ... 2)))) sold · \(ReportsText.count(ReportsJSON.int(item["lineCount"]), "line"))",
                        amount: ReportsJSON.int(item["net"]), currency: currency,
                        share: net > 0 ? Double(ReportsJSON.int(item["net"])) / Double(net) : 0, tint: DTheme.special,
                        trailingNote: net > 0 ? ReportsText.percent(Double(ReportsJSON.int(item["net"])) / Double(net) * 100) : nil
                    )
                }
            }
        }
    }
}
