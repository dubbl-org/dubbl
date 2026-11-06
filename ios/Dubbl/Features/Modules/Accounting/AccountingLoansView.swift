import Charts
import SwiftUI

/// One loan: its terms, the balance coming down over time and the
/// amortization schedule, with the next payment ready to post.
struct AccountingLoanDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var working = false
    @State private var confirmingDelete = false
    @State private var showAll = false

    private var loan: JSONValue? { remote.value?["loan"] }
    private var schedule: [JSONValue] { remote.value?["schedule"]?.arrayValue ?? [] }
    private var currency: String { env.session.currency }
    private var status: String { loan?["status"]?.stringValue ?? "active" }

    var body: some View {
        AccountingLoadState(value: loan, error: remote.error, retry: load) { loan in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let posted = schedule.filter { $0["posted"]?.boolValue == true }
                    let principal = loan["principalAmount"]?.intValue ?? 0
                    let balance = posted.last?["remainingBalance"]?.intValue ?? principal
                    let interestPaid = posted.reduce(0) { $0 + ($1["interestAmount"]?.intValue ?? 0) }
                    AccountingHero(
                        status: (RecordFormat.statusLabel(status), Self.tone(status)),
                        title: loan["name"]?.stringValue ?? "Loan",
                        amount: balance,
                        currency: currency,
                        caption: "Still owed of \(Money.format(principal, currency: currency))"
                    )
                    AccountingFigures(items: [
                        .init(label: "Monthly", value: Money.short(loan["monthlyPayment"]?.intValue ?? 0, currency: currency), detail: "\(posted.count) of \(schedule.count) paid"),
                        .init(label: "Rate", value: RecordFormat.percent(loan["interestRate"]?.intValue ?? 0), detail: AccountingWords.months(loan["termMonths"]?.intValue)),
                        .init(label: "Interest", value: Money.short(interestPaid, currency: currency), detail: "paid so far", tint: DTheme.orange),
                    ])
                    chart
                    scheduleCard
                    AccountingFacts(rows: [
                        ("Principal", Money.format(principal, currency: currency)),
                        ("Starts", loan["startDate"]?.stringValue.map(DubblDate.display)),
                        ("Term", AccountingWords.months(loan["termMonths"]?.intValue)),
                        ("Interest rate", loan["interestRate"]?.intValue.map(RecordFormat.percent)),
                        ("Paid from", loan["bankAccount.accountName"]?.stringValue ?? loan["bankAccount.name"]?.stringValue),
                        ("Principal account", loan["principalAccount"].flatMap(AccountingAssetDetailView.account)),
                        ("Interest account", loan["interestAccount"].flatMap(AccountingAssetDetailView.account)),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "active" ? 110 : 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Loan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("How is the \(loan?["name"]?.stringValue ?? "loan") tracking, and what would paying it off early save?", page: "loans")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if status == "active" {
                        Button("Mark paid off", systemImage: "checkmark.circle") { Task { await setStatus("paid_off") } }
                    } else {
                        Button("Mark active", systemImage: "arrow.uturn.backward") { Task { await setStatus("active") } }
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if loan != nil, status == "active", let next = schedule.first(where: { $0["posted"]?.boolValue != true }) {
                AccountingActionBar {
                    Button {
                        Task { await postPayment() }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "arrow.down.circle") }
                            Text("Post \(Money.format(next["totalPayment"]?.intValue ?? 0, currency: currency)) payment")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
                .disabled(working)
            }
        }
        .confirmationDialog("Delete this loan?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await AccountingRun.run(env, "Loan deleted", key: AccountingCatalog.loansKey, {
                        let _: JSONValue = try await env.api.delete("loans/\(id)")
                    }) { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Payments already posted stay in your books.")
        }
        .task { await load() }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "active": .info
        case "paid_off": .positive
        case "defaulted": .negative
        default: .neutral
        }
    }

    private struct BalancePoint: Identifiable {
        let date: Date
        let balance: Int
        let paid: Bool
        var id: Date { date }
    }

    @ViewBuilder
    private var chart: some View {
        let points = schedule.compactMap { row -> BalancePoint? in
            guard let date = DubblDate.parseDay(row["date"]?.stringValue) else { return nil }
            return BalancePoint(date: date, balance: row["remainingBalance"]?.intValue ?? 0, paid: row["posted"]?.boolValue == true)
        }
        if points.count >= 3 {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Balance over the term")
                Chart(points) { point in
                    AreaMark(x: .value("Date", point.date), y: .value("Balance", Double(point.balance) / 100))
                        .foregroundStyle(LinearGradient(colors: [DTheme.accent.opacity(0.18), DTheme.accent.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Date", point.date), y: .value("Balance", Double(point.balance) / 100))
                        .foregroundStyle(DTheme.accent)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    if let today = points.last(where: \.paid) {
                        if point.id == today.id {
                            PointMark(x: .value("Date", point.date), y: .value("Balance", Double(point.balance) / 100))
                                .foregroundStyle(DTheme.ink)
                                .symbolSize(40)
                        }
                    }
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
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.year())
                            .font(.system(size: 10.5))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                .frame(height: 150)
                .padding(16)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            }
        }
    }

    /// The next payments first; the full schedule on demand.
    @ViewBuilder
    private var scheduleCard: some View {
        if !schedule.isEmpty {
            let nextIndex = schedule.firstIndex { $0["posted"]?.boolValue != true }
            let rows: [JSONValue] = {
                if showAll { return schedule }
                let start = max((nextIndex ?? schedule.count) - 2, 0)
                return Array(schedule[start ..< min(start + 6, schedule.count)])
            }()
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Schedule · \(schedule.count) payments", action: (showAll ? "Show less" : "Show all", { withAnimation(.snappy) { showAll.toggle() } }))
                CardStack(dividerInset: 52) {
                    ForEach(rows, id: \.self) { row in
                        let number = row["periodNumber"]?.intValue ?? 0
                        AccountingScheduleRow(
                            title: "\(number). \(DubblDate.display(row["date"]?.stringValue))",
                            detail: "incl. \(Money.format(row["interestAmount"]?.intValue ?? 0, currency: currency)) interest",
                            amount: row["totalPayment"]?.intValue ?? 0,
                            currency: currency,
                            trailing: "Leaves \(Money.short(row["remainingBalance"]?.intValue ?? 0, currency: currency))",
                            done: row["posted"]?.boolValue == true,
                            isNext: nextIndex.map { schedule[$0] == row } ?? false
                        )
                    }
                }
            }
        }
    }

    private func load() async {
        await remote.load(env.api, "loans/\(id)")
    }

    private func postPayment() async {
        working = true
        defer { working = false }
        if await AccountingRun.run(env, "Payment posted", key: AccountingCatalog.loansKey, {
            let _: JSONValue = try await env.api.post("loans/\(id)/post-payment", body: [String: JSONValue]())
        }) { await load() }
    }

    private func setStatus(_ status: String) async {
        if await AccountingRun.run(env, status == "paid_off" ? "Marked paid off" : "Marked active", key: AccountingCatalog.loansKey, {
            let _: JSONValue = try await env.api.patch("loans/\(id)", body: ["status": JSONValue.string(status)])
        }) { await load() }
    }
}

/// Add a loan: amount, rate, term and the two accounts its payments split
/// across. The monthly payment and schedule are worked out for you.
struct AccountingNewLoanSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var principal = 0
    @State private var rate = ""
    @State private var termMonths = 36
    @State private var start = Date.now
    @State private var principalAccount: AccountingAccountRef?
    @State private var interestAccount: AccountingAccountRef?
    @State private var saving = false
    @State private var error: String?

    /// "6.5" -> 650 basis points.
    private var rateBasisPoints: Int? {
        guard let value = Double(rate.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: "%", with: "")), value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    /// The same PMT the server works out, as a preview.
    private var monthly: Int? {
        guard principal > 0, let bp = rateBasisPoints, termMonths > 0 else { return nil }
        let r = Double(bp) / 10000 / 12
        if r == 0 { return principal / termMonths }
        let p = Double(principal)
        return Int((p * r / (1 - pow(1 + r, -Double(termMonths)))).rounded())
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && principal > 0 && rateBasisPoints != nil && principalAccount != nil && interestAccount != nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. Equipment loan", text: $name)
                        }
                        FieldRow(label: "Amount borrowed") {
                            AmountField(minor: $principal, currency: env.session.currency)
                        }
                        FieldRow(label: "Interest rate (% a year)") {
                            TextField("e.g. 6.5", text: $rate)
                                .keyboardType(.decimalPad)
                                .font(DFont.figure(16, weight: .regular))
                        }
                        Stepper(value: $termMonths, in: 1 ... 480, step: 12) {
                            HStack {
                                Text("Term")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Text(AccountingWords.months(termMonths) ?? "")
                                    .font(.system(size: 15))
                                    .monospacedDigit()
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        AccountingDateRow(label: "First payment", date: $start)
                    }
                    if let monthly {
                        HStack {
                            Text("Monthly payment")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.inkSecondary)
                            Spacer()
                            Text(Money.format(monthly, currency: env.session.currency))
                                .font(.system(size: 17, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(DTheme.ink)
                                .contentTransition(.numericText(value: Double(monthly)))
                        }
                        .padding(.horizontal, 4)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Accounts")
                        CardStack {
                            AccountingAccountField(label: "Loan balance (liability)", types: ["liability"], account: $principalAccount)
                            AccountingAccountField(label: "Interest (expense)", types: ["expense"], account: $interestAccount)
                        }
                    }
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "New loan", saveTitle: "Add", canSave: canSave, saving: saving, save: save)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            // This route takes the principal in major units.
            let _: JSONValue = try await env.api.post("loans", body: [
                "name": JSONValue.string(name.trimmingCharacters(in: .whitespaces)),
                "principalAmount": .number(AccountingAmount.major(principal)),
                "interestRate": .number(Double(rateBasisPoints ?? 0)),
                "termMonths": .number(Double(termMonths)),
                "startDate": .string(AccountingDay.string(start)),
                "principalAccountId": .string(principalAccount?.id ?? ""),
                "interestAccountId": .string(interestAccount?.id ?? ""),
            ])
            env.toast.show("Loan added")
            AccountingPost.changed(AccountingCatalog.loansKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
