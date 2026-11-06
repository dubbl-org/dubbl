import SwiftUI

/// Drill-down from any report row with an account id: the account's posted
/// lines for the report's period, newest first, with the running balance.
/// Lines that came from an invoice or bill open it.
///
/// `GET reports/account-transactions?accountId&startDate&endDate` ->
/// `{ account, transactions: [{ date, entryNumber, description, reference,
/// sourceType, sourceId, debit, credit, runningBalance }], totalDebit,
/// totalCredit, closingBalance }`. With a tracking filter it reads
/// `GET reports/general-ledger?accountId&costCenterId|projectId` -> `{ entries }`.
struct ReportsAccountView: View {
    let accountId: String
    let name: String
    var code: String?
    let start: String
    let end: String
    var dimension: (key: String, value: String)?

    @Environment(AppEnvironment.self) private var env

    private var path: String { dimension == nil ? "reports/account-transactions" : "reports/general-ledger" }

    private var query: [String: String?] {
        var query: [String: String?] = ["accountId": accountId, "startDate": start, "endDate": end]
        if let dimension {
            query[dimension.key] = dimension.value
            query["limit"] = "500"
        }
        return query
    }

    var body: some View {
        ReportsPage(code.map { "\($0) · \(name)" } ?? name, path: path, query: query, tilly: "Explain the movements on \(name) between \(DubblDate.display(start)) and \(DubblDate.display(end)).") { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let lines = ReportsJSON.array(value["transactions"] ?? value["entries"])
        let debits = value["totalDebit"]?.intValue ?? lines.reduce(0) { $0 + ReportsJSON.int($1["debit"]) }
        let credits = value["totalCredit"]?.intValue ?? lines.reduce(0) { $0 + ReportsJSON.int($1["credit"]) }
        let closing = value["closingBalance"]?.intValue ?? lines.last.map { ReportsJSON.int($0["runningBalance"]) } ?? 0
        let type = ReportsJSON.string(value["account.type"]).map { RecordFormat.statusLabel($0) }

        ReportsHeadline(
            label: "Movement",
            amount: closing,
            currency: currency,
            caption: [type, "\(DubblDate.short(start)) – \(DubblDate.display(end))"].compactMap { $0 }.joined(separator: " · "),
            negativeIsBad: false
        )
        ReportsFigures(items: [
            .money("Debits", debits, currency: currency, detail: ReportsText.count(lines.filter { ReportsJSON.int($0["debit"]) > 0 }.count, "line"), tint: DTheme.accent),
            .money("Credits", credits, currency: currency, detail: ReportsText.count(lines.filter { ReportsJSON.int($0["credit"]) > 0 }.count, "line"), tint: DTheme.orange),
        ])
        if lines.isEmpty {
            ReportsEmpty(symbol: "book.closed", title: "No movements", message: "Nothing was posted to this account in the period.")
        } else {
            ReportsSection(title: ReportsText.count(lines.count, "line"), trailing: "Newest first") {
                ForEach(Array(lines.reversed().prefix(300).enumerated()), id: \.offset) { _, line in
                    lineRow(line, currency: currency)
                }
            }
        }
    }

    @ViewBuilder
    private func lineRow(_ line: JSONValue, currency: String) -> some View {
        let debit = ReportsJSON.int(line["debit"])
        let credit = ReportsJSON.int(line["credit"])
        let number = ReportsJSON.string(line["entryNumber"]).map { "JE-\($0)" }
        let subtitle = [DubblDate.short(ReportsJSON.string(line["date"])), number, ReportsJSON.string(line["reference"])]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let balance = ReportsJSON.int(line["runningBalance"])
        let row = HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(ReportsJSON.string(line["description"]) ?? "Journal entry")
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                Text(subtitle)
                    .font(.system(size: 12.5))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(debit > 0 ? Money.format(debit, currency: currency) : "−" + Money.format(credit, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(debit > 0 ? DTheme.ink : DTheme.inkSecondary)
                Text("Bal \(Money.format(balance, currency: currency))")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())

        switch ReportsJSON.string(line["sourceType"]) {
        case "invoice": ReportsDocumentLink(kind: .invoice, id: ReportsJSON.string(line["sourceId"])) { row }
        case "bill": ReportsDocumentLink(kind: .bill, id: ReportsJSON.string(line["sourceId"])) { row }
        default: row
        }
    }
}
