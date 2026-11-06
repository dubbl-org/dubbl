import SwiftUI

/// Which return a TaxReturnView works out.
enum TaxReturnKind: String {
    case vat, bas, salesTax, scheduleC

    var title: String {
        switch self {
        case .vat: "VAT return"
        case .bas: "BAS"
        case .salesTax: "Sales tax"
        case .scheduleC: "Schedule C"
        }
    }

    var endpoint: String {
        switch self {
        case .vat: "reports/vat-return"
        case .bas: "reports/bas"
        case .salesTax: "reports/sales-tax"
        case .scheduleC: "reports/schedule-c"
        }
    }

    /// VAT and BAS can be counted on an accrual or cash basis, and filed against a tax period.
    var periodic: Bool { self == .vat || self == .bas }

    /// Boxes backed by control-account lines (`reports/vat-return/transactions`).
    var drillable: Set<String> {
        switch self {
        case .vat: ["1", "4"]
        case .bas: ["1A", "1B"]
        default: []
        }
    }

    var emphasized: Set<String> {
        switch self {
        case .vat: ["3", "5"]
        case .bas: ["NET"]
        default: []
        }
    }

    var tillyPrompt: String {
        switch self {
        case .vat: "Walk me through this VAT return. Anything look off?"
        case .bas: "Walk me through this BAS. Anything look off?"
        case .salesTax: "How much sales tax did I collect, and what do I owe?"
        case .scheduleC: "Explain my Schedule C and where I could save tax."
        }
    }
}

/// A return worked out box by box for a period: the figure that matters up
/// top, every box below, drill-downs into the ledger lines behind output and
/// input tax, and filing when the period is one of your tax periods.
struct TaxReturnView: View {
    let kind: TaxReturnKind

    @Environment(AppEnvironment.self) private var env
    @State private var range: TaxDateRange
    @State private var basis = "accrual"
    @State private var report: JSONValue?
    @State private var periods: [JSONValue] = []
    @State private var error: String?
    @State private var filing = false
    @State private var askingReference = false
    @State private var reference = ""
    /// Set once the person picks a period, so loading periods doesn't override it.
    @State private var picked = false

    init(kind: TaxReturnKind) {
        self.kind = kind
        // Schedule C is annual; the others start on the last full quarter until a due tax period loads.
        let presets = TaxDateRange.presets()
        let label = kind == .scheduleC ? "Year to date" : "Last quarter"
        _range = State(initialValue: presets.first { $0.label == label } ?? presets.first ?? TaxDateRange(start: "", end: "", label: ""))
    }

    private var currency: String { env.session.currency }
    private var period: JSONValue? { range.periodID.flatMap { id in periods.first { $0.recordID == id } } }
    private var periodStatus: String? { period?["status"]?.stringValue }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(spacing: 10) {
                    TaxPeriodMenu(range: Binding(get: { range }, set: { range = $0; picked = true }), periods: periods)
                    if kind.periodic {
                        TaxSegment(options: [("accrual", "When recorded"), ("cash", "When paid")], selection: $basis)
                    }
                }
                TaxLoadState(loaded: report != nil, error: error, retry: { await load() }) {
                    if let report {
                        content(report)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("\(kind.tillyPrompt) Period: \(range.span).", page: "tax")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    NavigationLink(value: RecordPageRoute(path: "/tax/periods")) {
                        Label("Tax periods", systemImage: "calendar")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More")
            }
        }
        .task { await loadPeriods() }
        .task(id: "\(range.start)|\(range.end)|\(basis)") { await load() }
        .refreshable {
            await loadPeriods()
            await load()
        }
        .alert("Mark as filed", isPresented: $askingReference) {
            TextField("Reference (optional)", text: $reference)
            Button("Cancel", role: .cancel) {}
            Button("File") { Task { await file() } }
        } message: {
            Text("Locks \(range.label) and freezes these figures. Posts the entry that clears output and input tax.")
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ report: JSONValue) -> some View {
        switch kind {
        case .vat, .bas:
            periodicReturn(report)
        case .salesTax:
            salesTax(report)
        case .scheduleC:
            scheduleC(report)
        }
    }

    /// Boxes from the live report, or the frozen lines when the period has been filed.
    private func boxes(_ report: JSONValue) -> [(number: String, label: String, amount: Int)] {
        if kind == .vat, periodStatus != nil, periodStatus != "open",
           let lines = period?["lines"]?.arrayValue, !lines.isEmpty {
            return lines
                .sorted { ($0["sortOrder"]?.intValue ?? 0) < ($1["sortOrder"]?.intValue ?? 0) }
                .map { ($0["boxNumber"]?.stringValue ?? "", $0["label"]?.stringValue ?? "", $0["amount"]?.intValue ?? 0) }
        }
        let key = kind == .vat ? "boxes" : "fields"
        let numberKey = kind == .vat ? "box" : "field"
        return (report[key]?.arrayValue ?? []).map {
            ($0[numberKey]?.stringValue ?? "", $0["label"]?.stringValue ?? "", $0["amount"]?.intValue ?? 0)
        }
    }

    private func periodicReturn(_ report: JSONValue) -> some View {
        let rows = boxes(report)
        let amount = { (number: String) in rows.first { $0.number == number }?.amount ?? 0 }
        let net = kind == .vat ? amount("5") : amount("NET")
        let output = kind == .vat ? amount("1") : amount("1A")
        let input = kind == .vat ? amount("4") : amount("1B")
        let word = kind == .vat ? "VAT" : "GST"
        let frozen = kind == .vat && periodStatus != nil && periodStatus != "open" && !(period?["lines"]?.arrayValue ?? []).isEmpty

        return VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 14) {
                hero(label: net >= 0 ? "\(word) to pay" : "\(word) to reclaim", amount: abs(net), detail: frozen ? "As filed" : (basis == "cash" ? "Counted when money moved" : "Counted when recorded"))
                TaxCompareBars(items: [
                    ("Output \(word) on sales", output, DTheme.ink),
                    ("Input \(word) on purchases", input, DTheme.inkTertiary),
                ], currency: currency)
            }
            .dubblCard()

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(kind == .vat ? "Boxes" : "Fields")
                CardStack {
                    ForEach(rows, id: \.number) { row in
                        let drill = kind.drillable.contains(row.number) && !frozen
                        let line = TaxBoxRow(number: row.number, label: row.label, amount: row.amount, currency: currency, emphasized: kind.emphasized.contains(row.number), drillable: drill)
                        if drill {
                            NavigationLink {
                                TaxBoxTransactionsView(box: row.number, title: row.label, range: range, basis: basis)
                            } label: {
                                line
                            }
                            .buttonStyle(RowPressStyle())
                        } else {
                            line
                        }
                    }
                }
            }

            filingCard
        }
    }

    private func salesTax(_ report: JSONValue) -> some View {
        let rows = report["breakdown"]?.arrayValue ?? []
        let collected = rows.reduce(0) { $0 + ($1["taxCollected"]?.intValue ?? 0) }
        let taxable = rows.reduce(0) { $0 + ($1["taxableAmount"]?.intValue ?? 0) }
        let exempt = report["exemptAmount"]?.intValue ?? 0
        return VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 14) {
                hero(label: "Sales tax collected", amount: collected, detail: "\(Money.format(taxable, currency: currency)) taxable · \(Money.format(exempt, currency: currency)) exempt")
            }
            .dubblCard()

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("By rate")
                if rows.isEmpty {
                    Text("No taxed sales in this period.")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .dubblCard()
                } else {
                    CardStack {
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            let rate = row["taxRatePercent"]?.intValue
                            let count = row["invoiceCount"]?.intValue ?? 0
                            TaxFigureRow(
                                label: [row["taxRateName"]?.stringValue ?? "No rate", rate.map(TaxFormat.percent)].compactMap { $0 }.joined(separator: " · "),
                                value: Money.format(row["taxCollected"]?.intValue ?? 0, currency: currency),
                                detail: "\(Money.format(row["taxableAmount"]?.intValue ?? 0, currency: currency)) taxable · \(count) \(count == 1 ? "invoice" : "invoices")"
                            )
                        }
                        TaxFigureRow(label: "Exempt sales", value: Money.format(exempt, currency: currency), detail: "Invoice lines with no tax rate")
                        TaxFigureRow(label: "Total collected", value: Money.format(collected, currency: currency), strong: true)
                    }
                }
            }
        }
    }

    private func scheduleC(_ report: JSONValue) -> some View {
        let lines = (report["lines"]?.arrayValue ?? []).map {
            (number: $0["line"]?.stringValue ?? "", label: $0["label"]?.stringValue ?? "", amount: $0["amount"]?.intValue ?? 0)
        }
        let income = lines.filter { ["1", "2"].contains($0.number) }
        let expenses = lines.filter { !["1", "2"].contains($0.number) }
        let net = report["netProfit"]?.intValue ?? 0
        return VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 14) {
                hero(label: net >= 0 ? "Net profit" : "Net loss", amount: abs(net), detail: "Line 31")
                TaxCompareBars(items: [
                    ("Gross income", report["totalIncome"]?.intValue ?? 0, DTheme.ink),
                    ("Total expenses", report["totalExpenses"]?.intValue ?? 0, DTheme.inkTertiary),
                ], currency: currency)
            }
            .dubblCard()

            lineSection("Part I · Income", income, total: ("7", "Gross income", report["totalIncome"]?.intValue ?? 0))
            lineSection("Part II · Expenses", expenses, total: ("28", "Total expenses", report["totalExpenses"]?.intValue ?? 0))
        }
    }

    private func lineSection(_ title: String, _ lines: [(number: String, label: String, amount: Int)], total: (String, String, Int)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title)
            CardStack {
                ForEach(lines, id: \.number) { line in
                    TaxBoxRow(number: line.number, label: line.label, amount: line.amount, currency: currency)
                }
                TaxBoxRow(number: total.0, label: total.1, amount: total.2, currency: currency, emphasized: true)
            }
        }
    }

    private func hero(label: String, amount: Int, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 38, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.1)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText(value: Double(amount)))
            Text(detail)
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Filing

    @ViewBuilder
    private var filingCard: some View {
        if let period, let status = periodStatus {
            if status == "open" {
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(range.label) is open. File it once you've submitted the return to the tax authority.")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                    Button {
                        reference = ""
                        askingReference = true
                    } label: {
                        HStack(spacing: 8) {
                            if filing { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "checkmark.seal") }
                            Text("Mark as filed")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(filing)
                }
                .dubblCard()
            } else {
                HStack(spacing: 12) {
                    IconTile(symbol: "checkmark.seal.fill", tone: .positive)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(RecordFormat.statusLabel(status)) \(DubblDate.display(period["filedAt"]?.stringValue))")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(DTheme.ink)
                        if let ref = period["filedReference"]?.stringValue, !ref.isEmpty {
                            Text(ref)
                                .font(.system(size: 13, design: .monospaced))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    Spacer()
                }
                .dubblCard()
            }
        } else {
            NavigationLink(value: RecordPageRoute(path: "/tax/periods")) {
                HStack(spacing: 12) {
                    IconTile(symbol: "calendar.badge.checkmark")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("File this return")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(DTheme.ink)
                        Text("Pick one of your tax periods above to mark it as filed.")
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                .dubblCard()
            }
            .buttonStyle(TapScaleStyle())
        }
    }

    // MARK: Loading

    private func loadPeriods() async {
        guard let response: JSONValue = try? await env.api.get("tax-periods") else { return }
        periods = response["taxPeriods"]?.arrayValue ?? []
        // Start on the oldest open period that has ended: the return that's due.
        guard !picked, kind.periodic else { return }
        let today = DubblDate.string(.now)
        let due = periods
            .filter { $0["status"]?.stringValue == "open" && ($0["endDate"]?.stringValue ?? "") < today }
            .min { ($0["endDate"]?.stringValue ?? "") < ($1["endDate"]?.stringValue ?? "") }
        if let due, let option = TaxDateRange(period: due) { range = option }
    }

    private func load() async {
        var query = range.query
        if kind.periodic { query["basis"] = basis }
        do {
            let response: JSONValue = try await env.api.get(kind.endpoint, query: query)
            withAnimation(.snappy) {
                report = response
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if report == nil { self.error = error.localizedDescription }
        }
    }

    private func file() async {
        guard let id = range.periodID else { return }
        filing = true
        defer { filing = false }
        var body: [String: JSONValue] = ["mode": .string("file"), "basis": .string(basis)]
        let trimmed = reference.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { body["filedReference"] = .string(trimmed) }
        do {
            let _: JSONValue = try await env.api.post("tax-periods/\(id)/file", body: body)
            env.toast.show("\(range.label) filed")
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-periods")
            await loadPeriods()
        } catch {
            env.toast.error(error)
        }
    }
}

/// Two or three amounts as proportional bars, largest full width.
struct TaxCompareBars: View {
    let items: [(label: String, amount: Int, color: Color)]
    let currency: String

    var body: some View {
        let peak = max(items.map { abs($0.amount) }.max() ?? 1, 1)
        VStack(spacing: 10) {
            ForEach(items, id: \.label) { item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(item.label)
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.inkSecondary)
                        Spacer()
                        Text(Money.format(item.amount, currency: currency))
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                    GeometryReader { proxy in
                        Capsule().fill(DTheme.tint)
                            .overlay(alignment: .leading) {
                                Capsule().fill(item.color)
                                    .frame(width: max(4, proxy.size.width * CGFloat(abs(item.amount)) / CGFloat(peak)))
                            }
                    }
                    .frame(height: 6)
                }
            }
        }
    }
}

/// The ledger lines that make up one output or input tax box.
struct TaxBoxTransactionsView: View {
    let box: String
    let title: String
    let range: TaxDateRange
    let basis: String

    @Environment(AppEnvironment.self) private var env
    @State private var response: JSONValue?
    @State private var error: String?

    private var currency: String { env.session.currency }

    var body: some View {
        let rows = response?["transactions"]?.arrayValue ?? []
        List {
            if response != nil {
                LedgerTotals(items: [
                    .init(label: "Box \(box)", value: Money.format(response?["total"]?.intValue ?? 0, currency: currency), detail: range.span),
                    .init(label: "Lines", value: "\(response?["count"]?.intValue ?? rows.count)", detail: basis == "cash" ? "Cash basis" : "Accrual basis"),
                ])
                .padding(.vertical, 14)
                .ledgerRow()
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    TaxTransactionRow(row: row, currency: currency)
                        .ledgerRow()
                }
                LedgerEndMarker(text: rows.isEmpty ? "Nothing in this box for the period" : "\(rows.count) \(rows.count == 1 ? "line" : "lines")")
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
            } else {
                SkeletonRows(rows: 8, avatar: false)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(DTheme.canvas)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        var query = range.query
        query["box"] = box
        query["basis"] = basis
        do {
            response = try await env.api.get("reports/vat-return/transactions", query: query)
            error = nil
        } catch {
            if response == nil { self.error = error.localizedDescription }
        }
    }
}

private struct TaxTransactionRow: View {
    let row: JSONValue
    let currency: String

    var body: some View {
        let parts = [
            row["entryNumber"]?.stringValue,
            row["date"]?.stringValue.map(DubblDate.short),
            row["sourceType"]?.stringValue.map { $0.replacingOccurrences(of: "_", with: " ").humanized },
        ].compactMap { $0 }
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(row["description"]?.stringValue ?? row["reference"]?.stringValue ?? "Journal line")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(parts.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(Money.format(row["amount"]?.intValue ?? 0, currency: currency))
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
        }
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }
}
