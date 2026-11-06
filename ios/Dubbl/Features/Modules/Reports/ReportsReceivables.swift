import SwiftUI

// Getting paid and paying: aged receivables and payables, payment
// performance and duplicate detection. Rows open the invoice or bill.

// MARK: - Aged receivables / payables

/// `GET reports/aged-receivables|aged-payables[?asAt]` -> `{ asAt, buckets: [{ label,
/// total, count, invoices|bills: [{ id, invoiceNumber|billNumber, contactName,
/// dueDate, amountDue, daysOverdue }] }], grandTotal }`. The bucket totals are
/// the same shape Home reads as `HomeAgingReport`.
struct ReportsAgedView: View {
    let payables: Bool

    @Environment(AppEnvironment.self) private var env
    @State private var asAt = Date.now
    @State private var grouping = "age"

    private var path: String { payables ? "reports/aged-payables" : "reports/aged-receivables" }
    private var title: String { payables ? "Aged payables" : "Aged receivables" }
    private var itemsKey: String { payables ? "bills" : "invoices" }
    private var numberKey: String { payables ? "billNumber" : "invoiceNumber" }
    private var noun: String { payables ? "bill" : "invoice" }

    /// Today's report is the live one; a past date rebuilds balances as they were.
    private var query: [String: String?] {
        ReportsPeriod.calendar.isDateInToday(asAt) ? [:] : ["asAt": DubblDate.string(asAt)]
    }

    private static let colors: [String: Color] = [
        "Current": DTheme.accent, "1-30 days": DTheme.warning, "31-60 days": DTheme.orange, "61-90 days": DTheme.negative.opacity(0.7), "90+ days": DTheme.negative,
    ]

    var body: some View {
        ReportsPage(
            title, path: path, query: query,
            tilly: payables ? "Which bills should I pay first, and is anything overdue?" : "Who owes me money, and who should I chase first?",
            export: ReportsExport(path: path, query: query, name: "\(title) \(DubblDate.string(asAt))")
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsAsAtBar(date: $asAt)
                ReportsChoice(options: [("age", "By age"), ("contact", payables ? "By supplier" : "By customer")], selection: $grouping)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let buckets = ReportsJSON.array(value["buckets"])
        let total = ReportsJSON.int(value["grandTotal"])
        let overdue = buckets.filter { $0["label"]?.stringValue != "Current" }.reduce(0) { $0 + ReportsJSON.int($1["total"]) }
        let count = buckets.reduce(0) { $0 + ReportsJSON.int($1["count"]) }
        ReportsHeadline(
            label: payables ? "You owe" : "Owed to you", amount: total, currency: currency,
            caption: "\(Money.format(overdue, currency: currency)) overdue · \(ReportsText.count(count, noun))",
            captionTone: overdue > 0 ? .negative : .neutral
        )
        if count == 0 {
            ReportsEmpty(symbol: "checkmark.circle", title: payables ? "Nothing to pay" : "Nothing owed", message: payables ? "Every bill is paid." : "Every invoice is paid.")
        } else {
            ReportsSplitBar(
                parts: buckets.map { bucket in
                    let label = bucket["label"]?.stringValue ?? ""
                    return .init(label: label, value: ReportsJSON.int(bucket["total"]), color: Self.colors[label] ?? DTheme.inkTertiary)
                },
                currency: currency
            )
            if grouping == "age" {
                ForEach(Array(buckets.enumerated()), id: \.offset) { _, bucket in
                    let items = ReportsJSON.array(bucket[itemsKey])
                    if !items.isEmpty {
                        let label = bucket["label"]?.stringValue ?? ""
                        ReportsSection(title: label == "Current" ? "Not due yet" : "\(label) overdue", trailing: Money.format(ReportsJSON.int(bucket["total"]), currency: currency)) {
                            ForEach(Array(items.sorted { ReportsJSON.int($0["amountDue"]) > ReportsJSON.int($1["amountDue"]) }.enumerated()), id: \.offset) { _, item in
                                row(item, currency: currency)
                            }
                        }
                    }
                }
            } else {
                byContact(buckets, currency: currency)
            }
        }
    }

    private func row(_ item: JSONValue, currency: String) -> some View {
        let days = ReportsJSON.int(item["daysOverdue"])
        let due = DubblDate.short(item["dueDate"]?.stringValue)
        return ReportsDocumentLink(kind: payables ? .bill : .invoice, id: item.recordID) {
            ReportsRow(
                title: item["contactName"]?.stringValue ?? "Unknown",
                code: item[numberKey]?.stringValue,
                subtitle: days > 0 ? "Due \(due) · \(ReportsText.count(days, "day")) late" : "Due \(due)",
                amount: ReportsJSON.int(item["amountDue"]), currency: currency,
                valueTone: days > 30 ? .negative : .neutral,
                chevron: true
            )
        }
    }

    /// One contact's open documents added up.
    private struct ContactGroup {
        let name: String
        var total = 0
        var overdue = 0
        var count = 0
        var oldest = 0
    }

    private func groups(_ buckets: [JSONValue]) -> [ContactGroup] {
        var byName: [String: ContactGroup] = [:]
        for item in buckets.flatMap({ ReportsJSON.array($0[itemsKey]) }) {
            let name = item["contactName"]?.stringValue ?? "Unknown"
            let amount = ReportsJSON.int(item["amountDue"])
            let days = ReportsJSON.int(item["daysOverdue"])
            var group = byName[name] ?? ContactGroup(name: name)
            group.total += amount
            group.count += 1
            if days > 0 { group.overdue += amount }
            group.oldest = max(group.oldest, days)
            byName[name] = group
        }
        return byName.values.sorted { $0.total > $1.total }
    }

    @ViewBuilder
    private func byContact(_ buckets: [JSONValue], currency: String) -> some View {
        let grouped = groups(buckets)
        let peak = max(grouped.first?.total ?? 1, 1)
        ReportsSection(title: payables ? "Suppliers" : "Customers", trailing: "Most owed first") {
            ForEach(grouped, id: \.name) { group in
                let late = group.overdue > 0 ? " · \(Money.short(group.overdue, currency: currency)) overdue, oldest \(group.oldest)d" : " · none overdue"
                ReportsBarRow(
                    title: group.name,
                    subtitle: ReportsText.count(group.count, noun) + late,
                    amount: group.total, currency: currency, share: Double(group.total) / Double(peak),
                    tint: group.oldest > 30 ? DTheme.negative : group.overdue > 0 ? DTheme.warning : DTheme.accent
                )
            }
        }
    }
}

// MARK: - Payment performance

/// `GET reports/payment-performance?startDate&endDate` -> `{ avgDaysToCollect,
/// avgDaysToPay, receivables: [{ contactId, contactName, avgDays, avgTermDays,
/// invoiceCount, totalCollected, lateCount, onTimeRate }], payables: [... billCount,
/// totalPaid ...] }`.
struct ReportsPaymentPerformanceView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var side = "receivables"

    var body: some View {
        ReportsPage(
            "Payment performance", path: "reports/payment-performance", query: period.query,
            tilly: "Which customers pay late, and how quickly do I pay my suppliers?"
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ReportsChoice(options: [("receivables", "Customers"), ("payables", "Suppliers")], selection: $side)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let collect = ReportsJSON.int(value["avgDaysToCollect"])
        let pay = ReportsJSON.int(value["avgDaysToPay"])
        let rows = ReportsJSON.array(value[side])
        VStack(alignment: .leading, spacing: 6) {
            Text(side == "receivables" ? "Customers pay you in" : "You pay suppliers in")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(ReportsText.count(side == "receivables" ? collect : pay, "day"))
                .font(.system(size: 38, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.1)
                .foregroundStyle(DTheme.ink)
            Text("On average, from invoice date to paid · \(period.label)")
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        ReportsFigures(items: [
            LedgerTotals.Item(label: "To get paid", value: "\(collect)d", detail: "customers", tint: DTheme.accent),
            LedgerTotals.Item(label: "To pay", value: "\(pay)d", detail: "suppliers", tint: DTheme.orange),
        ])
        if rows.isEmpty {
            ReportsEmpty(symbol: "speedometer", title: "Nothing paid yet", message: side == "receivables" ? "Paid invoices from this period show up here." : "Paid bills from this period show up here.")
        } else {
            ReportsSection(title: side == "receivables" ? "Slowest payers first" : "Slowest payments first") {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    let days = ReportsJSON.int(row["avgDays"])
                    let terms = ReportsJSON.int(row["avgTermDays"])
                    let count = ReportsJSON.int(row[side == "receivables" ? "invoiceCount" : "billCount"])
                    let amount = ReportsJSON.int(row[side == "receivables" ? "totalCollected" : "totalPaid"])
                    ReportsDocumentLink(kind: .contact, id: row["contactId"]?.stringValue) {
                        ReportsRow(
                            title: row["contactName"]?.stringValue ?? "Contact",
                            subtitle: "\(ReportsJSON.int(row["onTimeRate"]))% on time · terms \(terms)d · \(ReportsText.count(count, side == "receivables" ? "invoice" : "bill")) · \(Money.short(amount, currency: currency))",
                            value: "\(days) days", valueTone: days > terms ? .warning : .positive, chevron: true
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Duplicate detection

/// `GET reports/duplicate-detection` -> `{ duplicateGroups: [{ type: invoice|bill,
/// contactName, amount, items: [{ id, number, date, status }] }], totalGroups }`.
/// Same contact and total within seven days.
struct ReportsDuplicatesView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ReportsPage("Duplicate detection", path: "reports/duplicate-detection", tilly: "Look at my possible duplicate invoices and bills. Which ones should I void?") { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let groups = ReportsJSON.array(value["duplicateGroups"])
        if groups.isEmpty {
            ReportsNote(symbol: "checkmark.seal.fill", text: "No likely duplicates. Invoices and bills with the same contact and total within a week would show up here.", tone: .positive)
        } else {
            let extra = groups.reduce(0) { $0 + ReportsJSON.int($1["amount"]) * max(ReportsJSON.array($1["items"]).count - 1, 0) }
            ReportsHeadline(
                label: "Possibly counted twice", amount: extra, currency: currency,
                caption: "\(ReportsText.count(groups.count, "group")) with the same contact and total within 7 days", captionTone: .warning, negativeIsBad: false
            )
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                let isBill = group["type"]?.stringValue == "bill"
                ReportsSection(
                    title: "\(group["contactName"]?.stringValue ?? "Contact") · \(Money.format(ReportsJSON.int(group["amount"]), currency: currency))",
                    trailing: isBill ? "Bills" : "Invoices"
                ) {
                    ForEach(Array(ReportsJSON.array(group["items"]).enumerated()), id: \.offset) { _, item in
                        let status = item["status"]?.stringValue ?? ""
                        ReportsDocumentLink(kind: isBill ? .bill : .invoice, id: item.recordID) {
                            HStack(spacing: 10) {
                                Text(item["number"]?.stringValue ?? "")
                                    .font(.system(size: 14.5, weight: .medium, design: .monospaced))
                                    .foregroundStyle(DTheme.ink)
                                Text(DubblDate.short(item["date"]?.stringValue))
                                    .font(.system(size: 13.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                                Spacer()
                                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11.5, weight: .semibold))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 48)
                            .contentShape(Rectangle())
                        }
                    }
                }
            }
        }
    }
}
