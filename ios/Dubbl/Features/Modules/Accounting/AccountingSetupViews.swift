import SwiftUI

// MARK: - Scheduled payments

/// Bill payments queued for a date. There's no detail route, so pending ones
/// are cancelled or removed from the row, and "Pay due now" runs the queue.
struct AccountingScheduledPaymentsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = AccountingRemote()
    @State private var filter = "all"
    @State private var search = ""
    @State private var confirmingRun = false
    @State private var working = false

    private static let statuses = [("pending", "Pending"), ("processing", "Processing"), ("completed", "Paid"), ("failed", "Failed"), ("cancelled", "Cancelled")]

    private var currency: String { env.session.currency }
    private var all: [JSONValue] { remote.value?["data"]?.arrayValue ?? [] }

    private var rows: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return all.filter { row in
            (filter == "all" || row["status"]?.stringValue == filter)
                && (term.isEmpty || Self.payee(row).localizedCaseInsensitiveContains(term) || (row["bill.billNumber"]?.stringValue ?? "").localizedCaseInsensitiveContains(term))
        }
    }

    private var due: [JSONValue] {
        all.filter { $0["status"]?.stringValue == "pending" && (DubblDate.daysFromToday($0["scheduledDate"]?.stringValue) ?? 1) <= 0 }
    }

    static func payee(_ row: JSONValue) -> String {
        row["contact.name"]?.stringValue ?? row["bill.contact.name"]?.stringValue ?? "Supplier"
    }

    var body: some View {
        AccountingLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            List {
                if search.isEmpty {
                    let pending = all.filter { $0["status"]?.stringValue == "pending" }
                    LedgerTotals(items: [
                        .init(label: "Scheduled", value: Money.short(pending.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }, currency: currency), detail: "\(pending.count) pending", tint: DTheme.accent) { filter = filter == "pending" ? "all" : "pending" },
                        .init(label: "Due now", value: Money.short(due.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }, currency: currency), detail: "\(due.count) ready to pay", tint: DTheme.warning),
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()
                }
                ForEach(rows, id: \.self) { row in
                    AccountingScheduledRow(row: row, currency: currency)
                        .ledgerRow()
                        .swipeActions(edge: .trailing) {
                            if row["status"]?.stringValue == "pending", let id = row.recordID {
                                Button("Delete", systemImage: "trash", role: .destructive) { Task { await delete(id) } }
                                Button("Cancel", systemImage: "xmark") { Task { await cancel(id) } }
                                    .tint(DTheme.warning)
                            }
                        }
                        .contextMenu {
                            if row["status"]?.stringValue == "pending", let id = row.recordID {
                                Button("Cancel payment", systemImage: "xmark") { Task { await cancel(id) } }
                                Button("Delete", systemImage: "trash", role: .destructive) { Task { await delete(id) } }
                            }
                            Button {
                                env.router.askTilly("Should I pay \(Self.payee(row)) on \(DubblDate.display(row["scheduledDate"]?.stringValue)), and is there enough cash?", page: "scheduled-payments")
                            } label: {
                                Label("Ask Tilly", systemImage: "sparkle")
                            }
                        }
                }
                LedgerEndMarker(text: "\(rows.count) \(rows.count == 1 ? "payment" : "payments")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
            .overlay {
                if rows.isEmpty {
                    EmptyStateView(symbol: "calendar", title: all.isEmpty ? "No scheduled payments" : "Nothing here", message: all.isEmpty ? "Schedule a bill payment from the bill and it queues here." : "No payments in this state.")
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Scheduled payments")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Supplier or bill")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Status", selection: $filter) {
                        Text("All").tag("all")
                        ForEach(Self.statuses, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                } label: {
                    Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityLabel("Filter by status")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Pay due now", systemImage: "play.circle") { confirmingRun = true }
                    .disabled(due.isEmpty || working)
            }
        }
        .confirmationDialog("Pay \(due.count) due \(due.count == 1 ? "payment" : "payments")?", isPresented: $confirmingRun, titleVisibility: .visible) {
            Button("Pay \(Money.format(due.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) }, currency: currency))") { Task { await process() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Each is recorded against its bill and posted to your books.")
        }
        .task { await load() }
    }

    private func load() async {
        await remote.load(env.api, "scheduled-payments", query: ["page": "1", "limit": "100"])
    }

    private func cancel(_ id: String) async {
        if await AccountingRun.run(env, "Payment cancelled", key: AccountingCatalog.scheduledKey, {
            let _: JSONValue = try await env.api.patch("scheduled-payments/\(id)", body: ["status": JSONValue.string("cancelled")])
        }) { await load() }
    }

    private func delete(_ id: String) async {
        if await AccountingRun.run(env, "Payment removed", key: AccountingCatalog.scheduledKey, {
            let _: JSONValue = try await env.api.delete("scheduled-payments/\(id)")
        }) { await load() }
    }

    private func process() async {
        working = true
        defer { working = false }
        do {
            let response: JSONValue = try await env.api.post("scheduled-payments/process", body: [String: JSONValue]())
            let processed = response["processed"]?.intValue ?? 0
            let total = response["total"]?.intValue ?? processed
            env.toast.show(processed == total ? "Paid \(processed) \(processed == 1 ? "bill" : "bills")" : "Paid \(processed) of \(total)", isError: processed < total)
            AccountingPost.changed(AccountingCatalog.scheduledKey)
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// "WeWork · BILL-0091 · 15 Oct      $3,200.00 Pending"
struct AccountingScheduledRow: View {
    let row: JSONValue
    let currency: String

    var body: some View {
        let status = row["status"]?.stringValue ?? "pending"
        let days = DubblDate.daysFromToday(row["scheduledDate"]?.stringValue)
        HStack(alignment: .center, spacing: 12) {
            Avatar(name: AccountingScheduledPaymentsView.payee(row), size: 36)
            VStack(alignment: .leading, spacing: 5) {
                Text(AccountingScheduledPaymentsView.payee(row))
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let number = row["bill.billNumber"]?.stringValue {
                        Text(number)
                            .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    Text(status == "pending" && (days ?? 1) <= 0 ? "Due \(DubblDate.short(row["scheduledDate"]?.stringValue))" : DubblDate.short(row["scheduledDate"]?.stringValue))
                        .font(.system(size: 13))
                        .foregroundStyle(status == "pending" && (days ?? 1) <= 0 ? DTheme.warning : DTheme.inkSecondary)
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(row["amount"]?.intValue ?? 0, currency: row["currencyCode"]?.stringValue ?? currency))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                    .fixedSize()
                LedgerStatus(text: status == "completed" ? "Paid" : RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Fiscal years

/// Financial years, newest first. Closing one posts the closing entries to
/// retained earnings and locks the period; reopening undoes both.
struct AccountingFiscalYearsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = AccountingRemote()
    @State private var creating = false
    @State private var target: JSONValue?
    @State private var working = false

    private var years: [JSONValue] {
        (remote.value?["fiscalYears"]?.arrayValue ?? []).filter { $0["deletedAt"]?.isNull != false }.reversed()
    }

    var body: some View {
        AccountingLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            List {
                ForEach(years, id: \.self) { year in
                    Button { target = year } label: {
                        AccountingFiscalYearRow(year: year)
                    }
                    .buttonStyle(RowPressStyle())
                    .ledgerRow()
                }
                if !years.isEmpty {
                    LedgerEndMarker(text: "\(years.count) \(years.count == 1 ? "year" : "years")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
            .overlay {
                if years.isEmpty {
                    EmptyStateView(symbol: "calendar.badge.checkmark", title: "No financial years yet", message: "Set up your financial year so you can close it at year end.", actionTitle: "New financial year") { creating = true }
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Financial years")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New financial year", systemImage: "plus") { creating = true }
            }
        }
        .confirmationDialog(target?["name"]?.stringValue ?? "", isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }), titleVisibility: .visible, presenting: target) { year in
            if year["isClosed"]?.boolValue == true {
                Button("Reopen year") { Task { await act(year, "reopen") } }
            } else {
                Button("Close year", role: .destructive) { Task { await act(year, "close") } }
            }
            Button("Cancel", role: .cancel) {}
        } message: { year in
            Text(year["isClosed"]?.boolValue == true
                ? "Reopening voids the closing entries and lifts the lock so you can make changes."
                : "Closing moves this year's profit to retained earnings and locks everything up to \(DubblDate.display(year["endDate"]?.stringValue)). Draft entries in the year must be posted or deleted first.")
        }
        .sheet(isPresented: $creating) {
            AccountingNewYearSheet(latestEnd: years.first?["endDate"]?.stringValue) { Task { await load() } }
        }
        .task { await load() }
    }

    private func load() async {
        await remote.load(env.api, "fiscal-years")
    }

    private func act(_ year: JSONValue, _ action: String) async {
        guard let id = year.recordID else { return }
        working = true
        defer { working = false }
        if await AccountingRun.run(env, action == "close" ? "Year closed" : "Year reopened", key: AccountingCatalog.yearsKey, {
            let _: JSONValue = try await env.api.post("fiscal-years/\(id)/\(action)", body: [String: JSONValue]())
        }) { await load() }
    }
}

/// "FY 2026 · 1 Jan – 31 Dec 2026   Current · Open"
struct AccountingFiscalYearRow: View {
    let year: JSONValue

    var body: some View {
        let closed = year["isClosed"]?.boolValue == true
        let start = DubblDate.daysFromToday(year["startDate"]?.stringValue) ?? 1
        let end = DubblDate.daysFromToday(year["endDate"]?.stringValue) ?? -1
        let current = start <= 0 && end >= 0
        HStack(alignment: .center, spacing: 12) {
            IconTile(symbol: closed ? "lock.fill" : (current ? "calendar.badge.clock" : "calendar"), tone: closed ? .neutral : (current ? .info : .neutral), size: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(year["name"]?.stringValue ?? "Financial year")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                Text("\(DubblDate.display(year["startDate"]?.stringValue)) – \(DubblDate.display(year["endDate"]?.stringValue))")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                LedgerStatus(text: closed ? "Closed" : "Open", tone: closed ? .neutral : .positive)
                if current {
                    Text("Current")
                        .font(.system(size: 12))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// A new financial year; starts the day after the latest one ends.
struct AccountingNewYearSheet: View {
    let latestEnd: String?
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var start = Date.now
    @State private var end = Date.now
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. FY 2027", text: $name)
                        }
                        AccountingDateRow(label: "Starts", date: $start)
                        AccountingDateRow(label: "Ends", date: $end)
                    }
                    AccountingFormError(message: error ?? (end <= start ? "The year has to end after it starts." : nil))
                }
                .padding(20)
            }
            .accountingFormChrome(title: "New financial year", saveTitle: "Add", canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty && end > start, saving: saving, save: save)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .onAppear(perform: prefill)
    }

    private func prefill() {
        let calendar = Calendar.current
        if let latest = DubblDate.parseDay(latestEnd), let next = calendar.date(byAdding: .day, value: 1, to: latest) {
            start = next
        } else {
            start = calendar.date(from: calendar.dateComponents([.year], from: .now)) ?? .now
        }
        end = calendar.date(byAdding: DateComponents(year: 1, day: -1), to: start) ?? start
        let endYear = calendar.component(.year, from: end)
        let startYear = calendar.component(.year, from: start)
        name = startYear == endYear ? "FY \(endYear)" : "FY \(startYear)–\(String(endYear).suffix(2))"
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("fiscal-years", body: [
                "name": JSONValue.string(name.trimmingCharacters(in: .whitespaces)),
                "startDate": .string(AccountingDay.string(start)),
                "endDate": .string(AccountingDay.string(end)),
            ])
            env.toast.show("Financial year added")
            AccountingPost.changed(AccountingCatalog.yearsKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Opening balances

/// The balances the books started from, as one posted journal. Saving new
/// ones voids the old entry and posts a fresh one.
struct AccountingOpeningBalancesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = AccountingRemote()
    @State private var editing = false

    private var entry: JSONValue? {
        guard let entry = remote.value?["entry"], !entry.isNull else { return nil }
        return entry
    }

    var body: some View {
        AccountingLoadState(value: remote.value, error: remote.error, retry: load) { _ in
            if let entry {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        let lines = Self.lines(entry)
                        AccountingHero(
                            number: entry["entryNumber"]?.stringValue.map { "#\($0)" },
                            status: ("Posted", .positive),
                            title: "As at \(DubblDate.display(entry["date"]?.stringValue))",
                            caption: "\(lines.count) accounts carried in. Debits and credits balance."
                        )
                        AccountingJournalCard(title: "Balances", lines: lines, currency: env.session.currency)
                        Text("Changing them voids this entry and posts a new one, so reports before and after stay consistent.")
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 110)
                }
                .refreshable { await load() }
                .safeAreaInset(edge: .bottom) {
                    AccountingActionBar {
                        Button { editing = true } label: {
                            Label("Change opening balances", systemImage: "pencil")
                        }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    }
                }
            } else {
                EmptyStateView(symbol: "flag", title: "No opening balances yet", message: "Moving from another system? Enter what each account held on the day you start with dubbl.", actionTitle: "Enter opening balances") { editing = true }
                    .frame(maxHeight: .infinity)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Opening balances")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) {
            AccountingOpeningBalancesSheet(entry: entry) { Task { await load() } }
        }
        .task { await load() }
    }

    /// Lines here are integer cents with the account nested.
    static func lines(_ entry: JSONValue) -> [AccountingJournalLine] {
        (entry["lines"]?.arrayValue ?? []).enumerated().map { index, line in
            AccountingJournalLine(
                id: line.recordID ?? "\(index)",
                code: line["account.code"]?.stringValue ?? "",
                account: line["account.name"]?.stringValue ?? "Account",
                memo: nil,
                debit: line["debitAmount"]?.intValue ?? 0,
                credit: line["creditAmount"]?.intValue ?? 0
            )
        }
    }

    private func load() async {
        await remote.load(env.api, "opening-balances")
    }
}

/// Enter or change opening balances: the date and a debit or credit per account.
struct AccountingOpeningBalancesSheet: View {
    let entry: JSONValue?
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var lines = [AccountingLineDraft(isDebit: true), AccountingLineDraft(isDebit: false)]
    @State private var saving = false
    @State private var error: String?
    @State private var prefilled = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        AccountingDateRow(label: "As at", date: $date)
                    }
                    AccountingLinesEditor(lines: $lines, currency: env.session.currency, showsMemo: false)
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "Opening balances", saveTitle: "Post", canSave: lines.isComplete && lines.isBalanced, saving: saving, save: save)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear(perform: prefill)
    }

    private func prefill() {
        guard !prefilled, let entry else { return }
        prefilled = true
        if let day = DubblDate.parseDay(entry["date"]?.stringValue) { date = day }
        let drafts = (entry["lines"]?.arrayValue ?? []).compactMap { line -> AccountingLineDraft? in
            guard let account = line["account"].flatMap(AccountingAccountRef.init) else { return nil }
            let debit = line["debitAmount"]?.intValue ?? 0
            let credit = line["creditAmount"]?.intValue ?? 0
            return AccountingLineDraft(account: account, isDebit: debit > 0, amount: debit > 0 ? debit : credit)
        }
        if drafts.count >= 2 { lines = drafts }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("opening-balances", body: [
                "date": JSONValue.string(AccountingDay.string(date)),
                "balances": .array(lines.map { line in
                    .object([
                        "accountId": .string(line.account?.id ?? ""),
                        "debitAmount": .number(Double(line.isDebit ? line.amount : 0)),
                        "creditAmount": .number(Double(line.isDebit ? 0 : line.amount)),
                    ])
                }),
            ])
            env.toast.show("Opening balances posted")
            AccountingPost.changed(AccountingCatalog.entriesKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
