import SwiftUI

// Tax: the VAT return box by box (with the lines behind boxes 1 and 4), the
// tax summary per rate, and 1099 totals per vendor.

// MARK: - VAT return

/// `GET reports/vat-return?startDate&endDate[&basis]` -> `{ boxes: [{ box, label,
/// amount }], period, basis, vatScheme }`. Boxes 1 and 4 open their lines.
struct ReportsVatReturnView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisQuarter
    @State private var basis = "auto"

    private var query: [String: String?] {
        var query = period.query
        if basis != "auto" { query["basis"] = basis }
        return query
    }

    /// Plain-words names for the nine boxes.
    private static let names = [
        "1": "VAT due on sales", "2": "VAT due on EU acquisitions", "3": "Total VAT due", "4": "VAT reclaimed on purchases",
        "5": "Net VAT to pay or reclaim", "6": "Sales before VAT", "7": "Purchases before VAT", "8": "Supplies to the EU", "9": "Acquisitions from the EU",
    ]

    var body: some View {
        ReportsPage("VAT return", path: "reports/vat-return", query: query, tilly: "Explain my VAT return for \(period.label). Anything I should double-check before filing?") {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period, ranges: [.quarter, .month, .year, .lastYear])
                ReportsChoice(options: [("auto", "Organization's scheme"), ("accrual", "Accrual"), ("cash", "Cash")], selection: $basis)
            }
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let boxes = ReportsJSON.array(value["boxes"])
        let amount = { (box: String) in ReportsJSON.int(boxes.first { $0["box"]?.stringValue == box }?["amount"]) }
        let net = amount("5")
        let basisLabel = (value["basis"]?.stringValue).map { "\($0) basis" } ?? ""
        ReportsHeadline(
            label: net >= 0 ? "VAT to pay" : "VAT to reclaim", amount: abs(net), currency: currency,
            caption: ["Box 5", period.label, basisLabel].filter { !$0.isEmpty }.joined(separator: " · ")
        )
        ReportsFigures(items: [
            .money("Due", amount("3"), currency: currency, detail: "box 3", tint: DTheme.orange),
            .money("Reclaimed", amount("4"), currency: currency, detail: "box 4", tint: DTheme.accent),
        ])
        if value["flatRate.applied"]?.boolValue == true {
            ReportsNote(symbol: "percent", text: "Flat rate scheme applied: box 1 is a percentage of gross sales and box 4 is zero.")
        }
        ReportsSection(title: "VAT") {
            ForEach(boxes.filter { ["1", "2", "3", "4", "5"].contains($0["box"]?.stringValue ?? "") }, id: \.self) { box in
                boxRow(box, currency: currency)
            }
        }
        ReportsSection(title: "Sales and purchases, before VAT") {
            ForEach(boxes.filter { ["6", "7", "8", "9"].contains($0["box"]?.stringValue ?? "") }, id: \.self) { box in
                boxRow(box, currency: currency)
            }
        }
    }

    @ViewBuilder
    private func boxRow(_ box: JSONValue, currency: String) -> some View {
        let number = box["box"]?.stringValue ?? ""
        let row = ReportsRow(
            title: Self.names[number] ?? box["label"]?.stringValue ?? "", code: "Box \(number)",
            amount: ReportsJSON.int(box["amount"]), currency: currency, bold: number == "5", chevron: number == "1" || number == "4"
        )
        if number == "1" || number == "4" {
            NavigationLink {
                ReportsVatBoxView(box: number, title: Self.names[number] ?? "Box \(number)", start: period.startString, end: period.endString, basis: basis == "auto" ? nil : basis)
            } label: { row }
                .buttonStyle(RowPressStyle())
        } else {
            row
        }
    }
}

/// The journal lines behind one VAT box: `GET reports/vat-return/transactions?box&startDate&endDate[&basis]`
/// -> `{ total, count, transactions: [{ entryNumber, date, description, reference,
/// accountCode, accountName, amount }] }`.
struct ReportsVatBoxView: View {
    let box: String
    let title: String
    let start: String
    let end: String
    var basis: String?

    @Environment(AppEnvironment.self) private var env

    private var query: [String: String?] {
        var query: [String: String?] = ["box": box, "startDate": start, "endDate": end]
        if let basis { query["basis"] = basis }
        return query
    }

    var body: some View {
        ReportsPage("Box \(box)", path: "reports/vat-return/transactions", query: query, tilly: "Explain what makes up box \(box) of my VAT return.") { value in
            let currency = env.session.currency
            let lines = ReportsJSON.array(value["transactions"])
            ReportsHeadline(label: title, amount: ReportsJSON.int(value["total"]), currency: currency, caption: "\(ReportsText.count(lines.count, "line")) · \(DubblDate.short(start)) – \(DubblDate.display(end))")
            if lines.isEmpty {
                ReportsEmpty(symbol: "doc.text.magnifyingglass", title: "No lines", message: "Nothing was posted to this box in the period.")
            } else {
                ReportsSection(title: "Lines") {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        ReportsRow(
                            title: ReportsJSON.string(line["description"]) ?? ReportsJSON.string(line["reference"]) ?? "Journal entry",
                            subtitle: [DubblDate.short(line["date"]?.stringValue), ReportsJSON.string(line["entryNumber"]).map { "JE-\($0)" }, ReportsJSON.string(line["sourceType"]).map(RecordFormat.statusLabel)]
                                .compactMap { $0 }.joined(separator: " · "),
                            amount: ReportsJSON.int(line["amount"]), currency: currency
                        )
                    }
                }
            }
        }
    }
}

// MARK: - Tax summary

/// `GET reports/tax-summary?startDate&endDate` -> `{ rates: [{ taxRateId, taxRateName,
/// rate (basis points), outputTax, outputNet, inputTax, inputNet, netTax, ... }],
/// totalOutputTax, totalInputTax, netTaxPayable }`.
struct ReportsTaxSummaryView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisQuarter

    var body: some View {
        ReportsPage("Tax summary", path: "reports/tax-summary", query: period.query, tilly: "Summarize the tax I collected and paid in \(period.label).") {
            ReportsPeriodBar(period: $period, ranges: [.quarter, .month, .year, .lastYear])
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let net = ReportsJSON.int(value["netTaxPayable"])
        let rates = ReportsJSON.array(value["rates"])
        ReportsHeadline(label: net >= 0 ? "Tax to pay" : "Tax to reclaim", amount: abs(net), currency: currency, caption: "Collected minus paid · \(period.label)")
        ReportsFigures(items: [
            .money("Collected", ReportsJSON.int(value["totalOutputTax"]), currency: currency, detail: "on sales", tint: DTheme.orange),
            .money("Paid", ReportsJSON.int(value["totalInputTax"]), currency: currency, detail: "on purchases", tint: DTheme.accent),
        ])
        if rates.isEmpty {
            ReportsEmpty(symbol: "percent", title: "No tax in this period", message: "Invoice and bill lines with a tax rate show up here.")
        } else {
            ReportsSection(title: "By rate", trailing: ReportsText.count(rates.count, "rate")) {
                ForEach(Array(rates.enumerated()), id: \.offset) { _, rate in
                    ReportsRow(
                        title: "\(rate["taxRateName"]?.stringValue ?? "Rate") · \(RecordFormat.percent(ReportsJSON.int(rate["rate"])))",
                        subtitle: "Collected \(Money.short(ReportsJSON.int(rate["outputTax"]), currency: currency)) on \(Money.short(ReportsJSON.int(rate["outputNet"]), currency: currency)) · paid \(Money.short(ReportsJSON.int(rate["inputTax"]), currency: currency)) on \(Money.short(ReportsJSON.int(rate["inputNet"]), currency: currency))",
                        amount: ReportsJSON.int(rate["netTax"]), currency: currency
                    )
                }
                ReportsTotalRow(title: "Net tax", amount: net, currency: currency)
            }
        }
    }
}

// MARK: - 1099

/// `GET reports/1099?year` -> `{ taxYear, threshold, vendors: [{ contactId, name,
/// taxIdentifier, w9TaxClassification, backupWithholding, totalPaid, paymentCount,
/// reportable }], reportableCount, reportableTotal, grandTotal }`.
struct Reports1099View: View {
    @Environment(AppEnvironment.self) private var env
    @State private var year = ReportsPeriod.calendar.component(.year, from: .now) - 1

    private var years: [Int] {
        let current = ReportsPeriod.calendar.component(.year, from: .now)
        return [current, current - 1, current - 2, current - 3]
    }

    var body: some View {
        ReportsPage("1099 totals", path: "reports/1099", query: ["year": "\(year)"], tilly: "Which vendors need a 1099 for \(year), and am I missing any W-9s?") {
            ReportsChoice(options: years.map { ($0, String($0)) }, selection: $year)
        } content: { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let vendors = ReportsJSON.array(value["vendors"])
        let reportable = vendors.filter { $0["reportable"]?.boolValue == true }
        let under = vendors.filter { $0["reportable"]?.boolValue != true }
        let missing = reportable.filter { ReportsJSON.string($0["taxIdentifier"]) == nil }.count
        ReportsHeadline(
            label: "Reportable payments · \(year)", amount: ReportsJSON.int(value["reportableTotal"]), currency: currency,
            caption: "\(ReportsText.count(ReportsJSON.int(value["reportableCount"]), "vendor")) at or over \(Money.format(ReportsJSON.int(value["threshold"]), currency: currency))"
        )
        if missing > 0 {
            ReportsNote(symbol: "exclamationmark.triangle.fill", text: "\(ReportsText.count(missing, "vendor")) to report \(missing == 1 ? "has" : "have") no tax ID on file. Ask for a W-9 before filing.", tone: .warning)
        }
        if vendors.isEmpty {
            ReportsEmpty(symbol: "doc.badge.ellipsis", title: "No 1099 vendors", message: "Mark suppliers as 1099 vendors on their contact to track them here. Card payments aren't counted.")
        } else {
            if !reportable.isEmpty {
                ReportsSection(title: "Need a 1099-NEC", trailing: ReportsText.count(reportable.count, "vendor")) {
                    ForEach(Array(reportable.enumerated()), id: \.offset) { _, vendor in vendorRow(vendor, currency: currency) }
                }
            }
            if !under.isEmpty {
                ReportsSection(title: "Under the threshold", trailing: Money.short(under.reduce(0) { $0 + ReportsJSON.int($1["totalPaid"]) }, currency: currency)) {
                    ForEach(Array(under.enumerated()), id: \.offset) { _, vendor in vendorRow(vendor, currency: currency) }
                }
            }
        }
    }

    private func vendorRow(_ vendor: JSONValue, currency: String) -> some View {
        let tin = ReportsJSON.string(vendor["taxIdentifier"])
        let facts = [
            ReportsText.count(ReportsJSON.int(vendor["paymentCount"]), "payment"),
            tin == nil ? "No tax ID" : "Tax ID on file",
            vendor["backupWithholding"]?.boolValue == true ? "Backup withholding" : nil,
        ].compactMap { $0 }
        return ReportsDocumentLink(kind: .contact, id: vendor["contactId"]?.stringValue) {
            ReportsRow(
                title: vendor["name"]?.stringValue ?? "Vendor", subtitle: facts.joined(separator: " · "),
                amount: ReportsJSON.int(vendor["totalPaid"]), currency: currency, chevron: true
            )
        }
    }
}
