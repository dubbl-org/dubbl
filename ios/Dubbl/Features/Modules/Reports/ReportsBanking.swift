import SwiftUI

// Bank and group reports: reconciliation status per account, money in and out
// of the bank by month or week, and consolidated results across a group.

// MARK: - Reconciliation status

/// `GET reports/bank-reconciliation-status` -> `{ accounts: [{ id, accountName,
/// balance, balanceDiscrepancy, unreconciled: { total, count, aging: { week, month,
/// twoMonths, older } }, lastImport, lastReconciliation, gaps }] }`.
struct ReportsReconciliationView: View {
    @Environment(AppEnvironment.self) private var env

    /// The API's age buckets for unreconciled lines.
    private static let aging: [(key: String, label: String, color: Color)] = [
        ("week", "This week", DTheme.accent), ("month", "8–30 days", DTheme.warning), ("twoMonths", "31–60 days", DTheme.orange), ("older", "Older", DTheme.negative),
    ]

    var body: some View {
        ReportsPage("Reconciliation status", path: "reports/bank-reconciliation-status", tilly: "Which bank accounts need reconciling first, and why?") { value in
            content(value)
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = env.session.currency
        let accounts = ReportsJSON.array(value["accounts"])
        let count = accounts.reduce(0) { $0 + ReportsJSON.int($1["unreconciled.count"]) }
        ReportsHeadline(
            label: "Waiting to be reconciled", amount: accounts.reduce(0) { $0 + ReportsJSON.int($1["unreconciled.total"]) }, currency: currency,
            caption: "\(ReportsText.count(count, "transaction")) across \(ReportsText.count(accounts.count, "account"))", negativeIsBad: false
        )
        if accounts.isEmpty {
            ReportsEmpty(symbol: "building.columns", title: "No bank accounts", message: "Connect or add a bank account to track reconciliation.")
        } else if count == 0 {
            ReportsNote(symbol: "checkmark.seal.fill", text: "Everything is reconciled.", tone: .positive)
        }
        ForEach(Array(accounts.enumerated()), id: \.offset) { _, account in
            card(account, currency: currency)
        }
    }

    private func card(_ account: JSONValue, currency: String) -> some View {
        let unreconciled = ReportsJSON.int(account["unreconciled.count"])
        let discrepancy = ReportsJSON.int(account["balanceDiscrepancy"])
        let lastRecon = account["lastReconciliation.endDate"]?.stringValue
        let lastImport = account["lastImport.date"]?.stringValue
        return ReportsSection(title: account["accountName"]?.stringValue ?? "Bank account", trailing: Money.format(ReportsJSON.int(account["balance"]), currency: currency)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(unreconciled == 0 ? "All reconciled" : "\(ReportsText.count(unreconciled, "transaction")) to reconcile")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                    Spacer()
                    Text(Money.format(ReportsJSON.int(account["unreconciled.total"]), currency: currency))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                }
                if unreconciled > 0 {
                    let counts = Self.aging.map { ReportsJSON.int(account["unreconciled.aging.\($0.key).count"]) }
                    GeometryReader { proxy in
                        HStack(spacing: 2) {
                            ForEach(Self.aging.indices, id: \.self) { index in
                                if counts[index] > 0 {
                                    Rectangle()
                                        .fill(Self.aging[index].color)
                                        .frame(width: max(4, (proxy.size.width - 6) * CGFloat(counts[index]) / CGFloat(max(unreconciled, 1))))
                                }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    .frame(height: 8)
                    .background(DTheme.tint)
                    .clipShape(Capsule())
                    Text(Self.aging.indices.compactMap { counts[$0] > 0 ? "\(Self.aging[$0].label) \(counts[$0])" : nil }.joined(separator: " · "))
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            .padding(16)
            ReportsRow(title: "Last reconciled", value: lastRecon.map { DubblDate.display($0) } ?? "Never", valueTone: lastRecon == nil ? .warning : .neutral)
            ReportsRow(title: "Last statement import", subtitle: account["lastImport.fileName"]?.stringValue, value: lastImport.map { DubblDate.short($0) } ?? "None")
            if account["gaps.hasGap"]?.boolValue == true {
                ReportsRow(
                    title: "Missing statement days",
                    subtitle: "\(DubblDate.short(account["gaps.gapStart"]?.stringValue)) – \(DubblDate.short(account["gaps.gapEnd"]?.stringValue))",
                    value: "\(ReportsJSON.int(account["gaps.gapDays"])) days", valueTone: .warning
                )
            }
            if discrepancy != 0 {
                ReportsRow(title: "Balance vs transactions", subtitle: "The account balance doesn't match its transactions", amount: discrepancy, currency: currency, valueTone: .negative)
            }
        }
    }
}

// MARK: - Bank cash flow

/// `GET reports/bank-cash-flow?startDate&endDate&groupBy=month|week[&bankAccountId]` ->
/// `{ periods: [{ label, startDate, endDate, inflows, outflows (negative), net,
/// balance }], totals: { inflows, outflows, net } }`. Accounts come from `bank-accounts`.
struct ReportsBankCashFlowView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var period = ReportsPeriod.thisYear
    @State private var groupBy = "month"
    @State private var accountId = "all"
    @State private var accounts: [BankAccount] = []

    private var query: [String: String?] {
        var query = period.query
        query["groupBy"] = groupBy
        if accountId != "all" { query["bankAccountId"] = accountId }
        return query
    }

    var body: some View {
        ReportsPage("Bank cash flow", path: "reports/bank-cash-flow", query: query, tilly: "How has money moved through my bank accounts in \(period.label)?") {
            VStack(alignment: .leading, spacing: 8) {
                ReportsPeriodBar(period: $period)
                ReportsChoice(options: [("month", "Monthly"), ("week", "Weekly")], selection: $groupBy)
                if accounts.count > 1 {
                    ReportsChoice(options: [("all", "All accounts")] + accounts.map { (value: $0.id, label: $0.accountName) }, selection: $accountId)
                }
            }
        } content: { value in
            content(value)
        }
        .task {
            if let response: BankAccountsResponse = try? await env.api.get("bank-accounts") {
                accounts = response.bankAccounts.filter(\.isActive)
            }
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = accounts.first { $0.id == accountId }?.currencyCode ?? env.session.currency
        let periods = ReportsJSON.array(value["periods"])
        let inflows = ReportsJSON.int(value["totals.inflows"])
        let outflows = abs(ReportsJSON.int(value["totals.outflows"]))
        ReportsHeadline(label: "Net movement · \(period.label)", amount: ReportsJSON.int(value["totals.net"]), currency: currency, caption: "From bank transactions, excluding ones you've excluded")
        ReportsFigures(items: [
            .money("Money in", inflows, currency: currency, tint: DTheme.positive),
            .money("Money out", outflows, currency: currency, tint: DTheme.orange),
        ])
        if periods.isEmpty {
            ReportsEmpty(symbol: "building.columns", title: "No transactions", message: "Bank transactions in this period show up here.")
        } else {
            ReportsColumnChart(
                points: periods.enumerated().flatMap { offset, item in
                    let label = Self.label(item, groupBy: groupBy)
                    return [
                        ReportsChartPoint(label: label, series: "In", value: ReportsJSON.int(item["inflows"]), order: offset),
                        ReportsChartPoint(label: label, series: "Out", value: abs(ReportsJSON.int(item["outflows"])), order: offset),
                    ]
                },
                currency: currency, colors: ["In": DTheme.positive, "Out": DTheme.chartSecondary]
            )
            ReportsSection(title: groupBy == "week" ? "Weeks" : "Months", trailing: "Newest first") {
                ForEach(Array(periods.reversed().enumerated()), id: \.offset) { _, item in
                    ReportsRow(
                        title: groupBy == "week" ? "Week of \(DubblDate.short(item["startDate"]?.stringValue))" : (DubblDate.parseDay(item["startDate"]?.stringValue)?.formatted(.dateTime.month(.wide).year()) ?? item["label"]?.stringValue ?? ""),
                        subtitle: "In \(Money.short(ReportsJSON.int(item["inflows"]), currency: currency)) · out \(Money.short(abs(ReportsJSON.int(item["outflows"])), currency: currency))",
                        amount: ReportsJSON.int(item["net"]), currency: currency
                    )
                }
            }
        }
    }

    private static func label(_ item: JSONValue, groupBy: String) -> String {
        let start = item["startDate"]?.stringValue
        if groupBy == "week" { return DubblDate.short(start) }
        return DubblDate.parseDay(start)?.formatted(.dateTime.month(.abbreviated)) ?? (item["label"]?.stringValue ?? "")
    }
}

// MARK: - Consolidation

/// Groups from `GET consolidation/groups` -> `{ groups: [{ id, name, members }] }`;
/// the worksheet from `GET consolidation/groups/{id}/report?startDate&endDate` ->
/// `{ presentationCurrency, consolidatedPnL, consolidatedBalanceSheet, translation,
/// elimination }`. New groups are `POST consolidation/groups { name }`; members are
/// managed on the web.
struct ReportsConsolidationView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var groups = ReportsLoader()
    @State private var groupId = ""
    @State private var period = ReportsPeriod.thisYear
    @State private var creating = false

    private var list: [JSONValue] { ReportsJSON.array(groups.value?["groups"]) }
    private var selected: String { groupId.isEmpty ? (list.first?.recordID ?? "") : groupId }

    var body: some View {
        Group {
            if groups.value == nil, let error = groups.error {
                ErrorStateView(message: error) { await groups.load(env.api, "consolidation/groups") }
                    .frame(maxHeight: .infinity)
                    .background(DTheme.shell)
            } else if groups.value == nil {
                ScrollView { ReportsSkeleton().padding(16) }.background(DTheme.shell)
            } else if list.isEmpty {
                EmptyStateView(
                    symbol: "square.stack.3d.down.right", title: "No groups yet",
                    message: "A group adds up the organizations you own into one set of results.",
                    actionTitle: "New group", action: { creating = true }
                )
                .frame(maxHeight: .infinity)
                .background(DTheme.shell)
            } else {
                ReportsPage(
                    "Consolidation", path: "consolidation/groups/\(selected)/report", query: period.query,
                    tilly: "Explain the consolidated results for my group in \(period.label)."
                ) {
                    VStack(alignment: .leading, spacing: 8) {
                        if list.count > 1 {
                            ReportsChoice(options: list.map { ($0.recordID ?? "", $0["name"]?.stringValue ?? "Group") }, selection: $groupId)
                        }
                        ReportsPeriodBar(period: $period)
                    }
                } content: { value in
                    content(value)
                }
            }
        }
        .navigationTitle("Consolidation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New group", systemImage: "plus") { creating = true }
            }
        }
        .task { await groups.load(env.api, "consolidation/groups") }
        .sheet(isPresented: $creating) {
            ReportsNewGroupSheet { Task { await groups.load(env.api, "consolidation/groups") } }
        }
    }

    @ViewBuilder
    private func content(_ value: JSONValue) -> some View {
        let currency = ReportsJSON.string(value["presentationCurrency"]) ?? env.session.currency
        let members = ReportsJSON.array(value["members"])
        let net = ReportsJSON.int(value["consolidatedPnL.netIncome"])
        ReportsHeadline(
            label: "Group net income · \(period.label)", amount: net, currency: currency,
            caption: "\(ReportsText.count(members.count, "organization")) in \(currency)"
        )
        ReportsFigures(items: [
            .money("Revenue", ReportsJSON.int(value["consolidatedPnL.totalRevenue"]), currency: currency, tint: DTheme.accent),
            .money("Expenses", ReportsJSON.int(value["consolidatedPnL.totalExpenses"]), currency: currency, tint: DTheme.orange),
        ])
        if members.isEmpty {
            ReportsNote(symbol: "person.2.badge.plus", text: "Add organizations to this group on the web to see their combined results.")
        }
        let entities = ReportsJSON.array(value["consolidatedPnL.byEntity"])
        if !entities.isEmpty {
            ReportsSection(title: "By organization") {
                ForEach(Array(entities.enumerated()), id: \.offset) { _, entity in
                    ReportsRow(
                        title: entity["label"]?.stringValue ?? "Organization",
                        subtitle: "In \(Money.short(ReportsJSON.int(entity["revenue"]), currency: currency)) · out \(Money.short(ReportsJSON.int(entity["expenses"]), currency: currency))",
                        amount: ReportsJSON.int(entity["netIncome"]), currency: currency
                    )
                }
            }
        }
        let check = ReportsJSON.int(value["consolidatedBalanceSheet.balanceCheck"])
        ReportsSection(title: "Balance sheet") {
            ReportsRow(title: "Assets", amount: ReportsJSON.int(value["consolidatedBalanceSheet.totalAssets"]), currency: currency)
            ReportsRow(title: "Liabilities", amount: ReportsJSON.int(value["consolidatedBalanceSheet.totalLiabilities"]), currency: currency)
            ReportsRow(title: "Equity", amount: ReportsJSON.int(value["consolidatedBalanceSheet.totalEquity"]), currency: currency)
            ReportsRow(title: check == 0 ? "Balanced" : "Out of balance", value: check == 0 ? "Yes" : Money.format(check, currency: currency), valueTone: check == 0 ? .positive : .negative)
        }
        let eliminations = ReportsJSON.array(value["elimination.entries"])
        if !eliminations.isEmpty {
            ReportsSection(title: "Intercompany eliminations", trailing: Money.short(ReportsJSON.int(value["elimination.totalEliminated"]), currency: currency)) {
                ForEach(Array(eliminations.enumerated()), id: \.offset) { _, rule in
                    let variance = ReportsJSON.int(rule["variance"])
                    ReportsRow(
                        title: rule["name"]?.stringValue ?? "Rule",
                        subtitle: rule["skipped"]?.boolValue == true ? (rule["skipReason"]?.stringValue ?? "Skipped") : (variance != 0 ? "Variance \(Money.format(variance, currency: currency))" : RecordFormat.statusLabel(rule["kind"]?.stringValue ?? "")),
                        amount: ReportsJSON.int(rule["eliminated"]), currency: currency
                    )
                }
            }
        }
        let translation = ReportsJSON.array(value["translation.byEntity"])
        if translation.contains(where: { ReportsJSON.int($0["cta"]) != 0 }) {
            ReportsSection(title: "Currency translation", trailing: Money.short(ReportsJSON.int(value["translation.totalCta"]), currency: currency)) {
                ForEach(Array(translation.enumerated()), id: \.offset) { _, entity in
                    ReportsRow(title: entity["label"]?.stringValue ?? "", subtitle: entity["functionalCurrency"]?.stringValue, amount: ReportsJSON.int(entity["cta"]), currency: currency)
                }
            }
        }
    }
}

/// Names a new consolidation group.
private struct ReportsNewGroupSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Group name", text: $name)
                } footer: {
                    Text("Add organizations to the group on the web. Needs a plan with consolidation.")
                }
            }
            .navigationTitle("New group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                let _: JSONValue = try await env.api.post("consolidation/groups", body: ["name": name.trimmingCharacters(in: .whitespaces)])
                env.toast.show("Group created")
                onCreated()
                dismiss()
            } catch {
                env.toast.error(error)
            }
        }
    }
}
