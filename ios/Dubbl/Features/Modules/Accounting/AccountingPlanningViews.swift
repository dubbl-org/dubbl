import Charts
import SwiftUI

// MARK: - Budget

/// A budget against what actually posted: totals, time gone versus money
/// spent, budget and actual per period, and every account line with its
/// variance. Reads `reports/budget-vs-actual?budgetId=`.
struct AccountingBudgetDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var expanded: Set<String> = []
    @State private var confirmingDelete = false

    private var report: JSONValue? { remote.value }
    private var currency: String { env.session.currency }

    var body: some View {
        AccountingLoadState(value: report, error: remote.error, retry: load) { report in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let budgeted = report["totalBudgeted"]?.intValue ?? 0
                    let actual = report["totalActual"]?.intValue ?? 0
                    let variance = report["totalVariance"]?.intValue ?? (budgeted - actual)
                    AccountingHero(
                        title: report["budget.name"]?.stringValue ?? "Budget",
                        amount: actual,
                        currency: currency,
                        caption: "Actual of \(Money.format(budgeted, currency: currency)) budgeted · \(period(report))"
                    )
                    AccountingFigures(items: [
                        .init(label: "Budget", value: Money.short(budgeted, currency: currency)),
                        .init(label: "Actual", value: Money.short(actual, currency: currency), tint: DTheme.accent),
                        .init(label: variance >= 0 ? "Left" : "Over", value: Money.short(abs(variance), currency: currency), tint: variance >= 0 ? DTheme.positive : DTheme.negative),
                    ])
                    pace(report, budgeted: budgeted, actual: actual)
                    chart(report)
                    lines(report)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Budget")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Where am I over or under on the \(report?["budget.name"]?.stringValue ?? "") budget, and what should I watch?", page: "budgets")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .confirmationDialog("Delete this budget?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await AccountingRun.run(env, "Budget deleted", key: AccountingCatalog.budgetsKey, {
                        let _: JSONValue = try await env.api.delete("budgets/\(id)")
                    }) { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
    }

    private func period(_ report: JSONValue) -> String {
        let range = [report["budget.startDate"]?.stringValue, report["budget.endDate"]?.stringValue].compactMap { $0.map(DubblDate.short) }.joined(separator: " – ")
        return [range, report["budget.periodType"]?.stringValue?.humanized].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Time gone against money spent, and where the burn rate lands.
    @ViewBuilder
    private func pace(_ report: JSONValue, budgeted: Int, actual: Int) -> some View {
        let total = max(report["totalDays"]?.intValue ?? 1, 1)
        let elapsed = report["daysElapsed"]?.intValue ?? 0
        let timeShare = min(Double(elapsed) / Double(total), 1)
        let spendShare = budgeted > 0 ? Double(actual) / Double(budgeted) : 0
        let projected = report["totalBurnRate"]?.intValue ?? 0
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Pace")
            VStack(alignment: .leading, spacing: 14) {
                bar("Time gone", share: timeShare, detail: "\(elapsed) of \(total) days", color: DTheme.inkTertiary)
                bar("Spent", share: spendShare, detail: "\(Int((spendShare * 100).rounded()))% of budget", color: spendShare > timeShare + 0.05 ? DTheme.warning : DTheme.accent)
                if projected > 0 {
                    Hairline()
                    HStack {
                        Text("On pace for")
                            .font(.system(size: 14.5))
                            .foregroundStyle(DTheme.inkSecondary)
                        Spacer()
                        Text(Money.format(projected, currency: currency))
                            .font(.system(size: 15.5, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(projected > budgeted ? DTheme.negative : DTheme.ink)
                    }
                }
            }
            .dubblCard()
        }
    }

    private func bar(_ label: String, share: Double, detail: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Spacer()
                Text(detail)
                    .font(.system(size: 12.5))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DTheme.tint)
                    Capsule().fill(color).frame(width: proxy.size.width * min(max(share, 0), 1))
                }
            }
            .frame(height: 6)
        }
    }

    private struct PeriodBar: Identifiable {
        let label: String
        let order: Int
        let series: String
        let amount: Int
        var id: String { "\(order)-\(series)" }
    }

    /// Budget and actual per period, summed over the lines.
    @ViewBuilder
    private func chart(_ report: JSONValue) -> some View {
        let bars: [PeriodBar] = {
            var budget = [String: (Int, Int)]()
            var actual = [String: Int]()
            for line in report["comparisons"]?.arrayValue ?? [] {
                for period in line["periods"]?.arrayValue ?? [] {
                    let label = period["label"]?.stringValue ?? ""
                    let order = period["sortOrder"]?.intValue ?? 0
                    budget[label] = ((budget[label]?.0 ?? 0) + (period["budgeted"]?.intValue ?? 0), order)
                    actual[label, default: 0] += period["actual"]?.intValue ?? 0
                }
            }
            return budget.sorted { $0.value.1 < $1.value.1 }.flatMap { label, value in
                [PeriodBar(label: label, order: value.1, series: "Budget", amount: value.0),
                 PeriodBar(label: label, order: value.1, series: "Actual", amount: actual[label] ?? 0)]
            }
        }()
        if bars.count >= 4 {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("By period")
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 14) {
                        legend("Budget", DTheme.inkTertiary.opacity(0.45))
                        legend("Actual", DTheme.accent)
                    }
                    Chart(bars) { bar in
                        BarMark(x: .value("Period", bar.label), y: .value("Amount", Double(bar.amount) / 100), width: .ratio(0.7))
                            .foregroundStyle(bar.series == "Budget" ? DTheme.inkTertiary.opacity(0.45) : DTheme.accent)
                            .position(by: .value("Series", bar.series))
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }
                    .chartYAxis {
                        AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                            AxisGridLine().foregroundStyle(DTheme.hairline)
                            AxisValueLabel {
                                if let amount = value.as(Double.self) {
                                    Text(Money.short(Int(amount * 100), currency: currency))
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(DTheme.inkTertiary)
                                }
                            }
                        }
                    }
                    .chartXAxis {
                        AxisMarks { _ in
                            AxisValueLabel()
                                .font(.system(size: 10.5))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                    .frame(height: 160)
                }
                .dubblCard()
            }
        }
    }

    private func legend(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(label)
                .font(.system(size: 12.5))
                .foregroundStyle(DTheme.inkSecondary)
        }
    }

    /// Each account: actual against budget; tap for its periods.
    @ViewBuilder
    private func lines(_ report: JSONValue) -> some View {
        let comparisons = report["comparisons"]?.arrayValue ?? []
        if !comparisons.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Accounts · \(comparisons.count)")
                CardStack {
                    ForEach(comparisons, id: \.self) { line in
                        lineRow(line)
                    }
                }
            }
        } else {
            EmptyStateView(symbol: "chart.bar", title: "No lines", message: "Add accounts to this budget on the web.")
        }
    }

    private func lineRow(_ line: JSONValue) -> some View {
        let key = line["accountId"]?.stringValue ?? ""
        let budgeted = line["budgeted"]?.intValue ?? 0
        let actual = line["actual"]?.intValue ?? 0
        let variance = line["variance"]?.intValue ?? (budgeted - actual)
        let share = budgeted > 0 ? Double(actual) / Double(budgeted) : 0
        let open = expanded.contains(key)
        return VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.snappy) {
                    if open { expanded.remove(key) } else { expanded.insert(key) }
                }
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        if let code = line["accountCode"]?.stringValue, !code.isEmpty {
                            Text(code)
                                .font(.system(size: 12, weight: .medium, design: .monospaced))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                        Text(line["accountName"]?.stringValue ?? "Account")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(variance >= 0 ? "\(Money.short(variance, currency: currency)) left" : "\(Money.short(-variance, currency: currency)) over")
                            .font(.system(size: 12.5, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(variance >= 0 ? DTheme.inkSecondary : DTheme.negative)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(DTheme.inkTertiary)
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(DTheme.tint)
                            Capsule().fill(share > 1 ? DTheme.negative : DTheme.accent).frame(width: proxy.size.width * min(share, 1))
                        }
                    }
                    .frame(height: 5)
                    Text("\(Money.format(actual, currency: currency)) of \(Money.format(budgeted, currency: currency))")
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                VStack(spacing: 6) {
                    ForEach(line["periods"]?.arrayValue ?? [], id: \.self) { period in
                        HStack {
                            Text(period["label"]?.stringValue ?? "")
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                            Spacer()
                            Text(Money.format(period["actual"]?.intValue ?? 0, currency: currency))
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(DTheme.ink)
                            Text("/ \(Money.format(period["budgeted"]?.intValue ?? 0, currency: currency))")
                                .font(.system(size: 12.5))
                                .monospacedDigit()
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                }
                .padding(.top, 2)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }

    private func load() async {
        await remote.load(env.api, "reports/budget-vs-actual", query: ["budgetId": id])
    }
}

// MARK: - Accrual schedule

/// An accrual spread over periods: what's posted, what's left, and the next
/// period ready to post.
struct AccountingAccrualDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var working = false
    @State private var confirmingDelete = false

    private var schedule: JSONValue? { remote.value?["schedule"] }
    private var currency: String { env.session.currency }

    var body: some View {
        AccountingLoadState(value: schedule, error: remote.error, retry: load) { schedule in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let entries = entries(schedule)
                    let posted = entries.filter { $0["posted"]?.boolValue == true }
                    let total = schedule["totalAmount"]?.intValue ?? 0
                    let postedSum = posted.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }
                    let status = schedule["status"]?.stringValue ?? "active"
                    AccountingHero(
                        status: (RecordFormat.statusLabel(status), RecordFormat.tone(status, spec: nil)),
                        title: schedule["description"]?.stringValue ?? "Accrual",
                        amount: total,
                        currency: currency,
                        caption: [schedule["startDate"]?.stringValue, schedule["endDate"]?.stringValue].compactMap { $0.map(DubblDate.short) }.joined(separator: " – ")
                    )
                    AccountingFigures(items: [
                        .init(label: "Posted", value: Money.short(postedSum, currency: currency), detail: "\(posted.count) of \(entries.count) periods", tint: DTheme.positive),
                        .init(label: "Remaining", value: Money.short(total - postedSum, currency: currency), detail: AccountingWords.frequency(schedule["frequency"]?.stringValue)),
                    ])
                    let nextID = entries.first { $0["posted"]?.boolValue != true }?.recordID
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Periods · \(entries.count)")
                        CardStack(dividerInset: 52) {
                            ForEach(entries, id: \.self) { entry in
                                AccountingScheduleRow(
                                    title: DubblDate.parseDay(entry["periodDate"]?.stringValue)?.formatted(.dateTime.month(.wide).year()) ?? "Period",
                                    detail: entry["posted"]?.boolValue == true ? "Posted" : (entry.recordID == nextID ? "Next to post" : "Scheduled"),
                                    amount: entry["amount"]?.intValue ?? 0,
                                    currency: currency,
                                    done: entry["posted"]?.boolValue == true,
                                    isNext: entry.recordID == nextID
                                )
                            }
                        }
                    }
                    AccountingFacts(rows: [
                        ("Created", schedule["createdAt"]?.stringValue.flatMap(RecordFormat.date)),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, canPost ? 110 : 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Accrual")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if canPost, let next = schedule.map(entries)?.first(where: { $0["posted"]?.boolValue != true }) {
                AccountingActionBar {
                    Button {
                        Task { await postNext() }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "checkmark.seal") }
                            Text("Post \(DubblDate.parseDay(next["periodDate"]?.stringValue)?.formatted(.dateTime.month(.wide)) ?? "next period")")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
                .disabled(working)
            }
        }
        .confirmationDialog("Delete this accrual?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await AccountingRun.run(env, "Accrual deleted", key: AccountingCatalog.accrualsKey, {
                        let _: JSONValue = try await env.api.delete("accrual-schedules/\(id)")
                    }) { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
    }

    private var canPost: Bool {
        guard let schedule, schedule["status"]?.stringValue == "active" else { return false }
        return entries(schedule).contains { $0["posted"]?.boolValue != true }
    }

    private func entries(_ schedule: JSONValue) -> [JSONValue] {
        (schedule["entries"]?.arrayValue ?? []).sorted { ($0["sortOrder"]?.intValue ?? 0) < ($1["sortOrder"]?.intValue ?? 0) }
    }

    private func load() async {
        await remote.load(env.api, "accrual-schedules/\(id)")
    }

    private func postNext() async {
        working = true
        defer { working = false }
        if await AccountingRun.run(env, "Period posted", key: AccountingCatalog.accrualsKey, {
            let _: JSONValue = try await env.api.post("accrual-schedules/\(id)/post", body: [String: JSONValue]())
        }) { await load() }
    }
}

// MARK: - Recurring journal

/// A journal template: when it runs, its legs, and pause or resume. Template
/// lines carry account ids only, so the chart is loaded for their names.
struct AccountingRecurringDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var accounts = AccountingRemote()
    @State private var working = false
    @State private var confirmingDelete = false

    private var template: JSONValue? { remote.value?["template"] }
    private var status: String { template?["status"]?.stringValue ?? "active" }
    private var currency: String { template?["currencyCode"]?.stringValue ?? env.session.currency }

    var body: some View {
        AccountingLoadState(value: template, error: remote.error, retry: load) { template in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let lines = lines(template)
                    AccountingHero(
                        status: (RecordFormat.statusLabel(status), Self.tone(status)),
                        title: template["name"]?.stringValue ?? "Recurring journal",
                        amount: lines.reduce(0) { $0 + $1.debit },
                        currency: currency,
                        caption: [AccountingWords.frequency(template["frequency"]?.stringValue), status == "active" ? template["nextRunDate"]?.stringValue.map { "next \(DubblDate.short($0))" } : nil].compactMap { $0 }.joined(separator: " · ")
                    )
                    AccountingJournalCard(lines: lines, currency: currency)
                    AccountingFacts(rows: [
                        ("Repeats", AccountingWords.frequency(template["frequency"]?.stringValue)),
                        ("Starts", template["startDate"]?.stringValue.map(DubblDate.display)),
                        ("Ends", template["endDate"]?.stringValue.map(DubblDate.display) ?? (template["maxOccurrences"]?.intValue.map { "After \($0) times" })),
                        ("Next run", status == "active" ? template["nextRunDate"]?.stringValue.map(DubblDate.display) : nil),
                        ("Last run", template["lastRunDate"]?.stringValue.map(DubblDate.display)),
                        ("Posted so far", template["occurrencesGenerated"]?.intValue.map { $0 == 1 ? "1 time" : "\($0) times" }),
                        ("Reference", template["reference"]?.stringValue),
                        ("Notes", template["notes"]?.stringValue),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "completed" ? 28 : 110)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Recurring journal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Post everything due now", systemImage: "play") { Task { await runDue() } }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
                .disabled(working)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if template != nil, status != "completed" {
                AccountingActionBar {
                    Button {
                        Task { await toggle() }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(status == "active" ? DTheme.ink : DTheme.canvas) } else { Image(systemName: status == "active" ? "pause" : "play") }
                            Text(status == "active" ? "Pause" : "Resume")
                        }
                    }
                    .buttonStyle(AccountingButtonChoice(filled: status != "active"))
                }
                .disabled(working)
            }
        }
        .confirmationDialog("Delete this recurring journal?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await AccountingRun.run(env, "Recurring journal deleted", key: AccountingCatalog.recurringKey, {
                        let _: JSONValue = try await env.api.delete("recurring-journals/\(id)")
                    }) { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Entries it already posted stay in your books.")
        }
        .task { await load() }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "active": .positive
        case "paused": .warning
        default: .neutral
        }
    }

    private func lines(_ template: JSONValue) -> [AccountingJournalLine] {
        var names = [String: (String, String)]()
        for account in accounts.value?["accounts"]?.arrayValue ?? [] {
            if let id = account.recordID { names[id] = (account["code"]?.stringValue ?? "", account["name"]?.stringValue ?? "") }
        }
        return (template["lines"]?.arrayValue ?? [])
            .sorted { ($0["sortOrder"]?.intValue ?? 0) < ($1["sortOrder"]?.intValue ?? 0) }
            .enumerated()
            .map { index, line in
                let account = names[line["accountId"]?.stringValue ?? ""]
                return AccountingJournalLine(
                    id: line.recordID ?? "\(index)",
                    code: account?.0 ?? "",
                    account: account?.1 ?? (line["description"]?.stringValue ?? "Account"),
                    memo: account == nil ? nil : line["description"]?.stringValue,
                    debit: line["debitAmount"]?.intValue ?? 0,
                    credit: line["creditAmount"]?.intValue ?? 0
                )
            }
    }

    private func load() async {
        async let template: Void = remote.load(env.api, "recurring-journals/\(id)")
        async let chart: Void = accounts.load(env.api, "accounts")
        _ = await (template, chart)
    }

    private func toggle() async {
        working = true
        defer { working = false }
        let pausing = status == "active"
        if await AccountingRun.run(env, pausing ? "Paused" : "Resumed", key: AccountingCatalog.recurringKey, {
            let _: JSONValue = try await env.api.post("recurring-journals/\(id)/pause", body: [String: JSONValue]())
        }) { await load() }
    }

    private func runDue() async {
        working = true
        defer { working = false }
        do {
            let response: JSONValue = try await env.api.post("recurring-journals/run", body: [String: JSONValue]())
            let posted = response["posted"]?.intValue ?? 0
            env.toast.show(posted == 0 ? "Nothing was due" : "Posted \(posted) \(posted == 1 ? "entry" : "entries")")
            AccountingPost.changed(AccountingCatalog.recurringKey)
            AccountingPost.changed(AccountingCatalog.entriesKey)
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// Filled ink or soft, chosen at runtime.
struct AccountingButtonChoice: ButtonStyle {
    let filled: Bool

    func makeBody(configuration: Configuration) -> some View {
        if filled {
            InkButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        } else {
            SoftButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        }
    }
}

/// A journal that posts itself on a schedule: name, how often, from when,
/// and balanced legs.
struct AccountingNewRecurringSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var frequency = "monthly"
    @State private var start = Date.now
    @State private var reference = ""
    @State private var lines = [AccountingLineDraft(isDebit: true), AccountingLineDraft(isDebit: false)]
    @State private var saving = false
    @State private var error: String?

    private static let frequencies = ["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && lines.isComplete && lines.isBalanced
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. Monthly rent accrual", text: $name)
                        }
                        HStack {
                            Text("Repeats")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Repeats", selection: $frequency) {
                                ForEach(Self.frequencies, id: \.self) { value in
                                    Text(AccountingWords.frequency(value) ?? value).tag(value)
                                }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                        AccountingDateRow(label: "First run", date: $start)
                        FieldRow(label: "Reference") {
                            TextField("Optional", text: $reference)
                        }
                    }
                    AccountingLinesEditor(lines: $lines, currency: env.session.currency)
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "New recurring journal", saveTitle: "Add", canSave: canSave, saving: saving, save: save)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let title = name.trimmingCharacters(in: .whitespaces)
        var body: [String: JSONValue] = [
            "name": .string(title),
            "frequency": .string(frequency),
            "startDate": .string(AccountingDay.string(start)),
            "currencyCode": .string(env.session.currency),
            // Each leg needs a description; the template name stands in.
            "lines": .array(lines.map { line in
                .object([
                    "accountId": .string(line.account?.id ?? ""),
                    "description": .string(line.memo.trimmingCharacters(in: .whitespaces).isEmpty ? title : line.memo),
                    "debitAmount": .number(Double(line.isDebit ? line.amount : 0)),
                    "creditAmount": .number(Double(line.isDebit ? 0 : line.amount)),
                ])
            }),
        ]
        let ref = reference.trimmingCharacters(in: .whitespaces)
        if !ref.isEmpty { body["reference"] = .string(ref) }
        do {
            let _: JSONValue = try await env.api.post("recurring-journals", body: body)
            env.toast.show("Recurring journal added")
            AccountingPost.changed(AccountingCatalog.recurringKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
