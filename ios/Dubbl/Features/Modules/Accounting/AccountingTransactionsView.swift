import SwiftUI

/// Journal entries, newest first: drafts to post, posted and voided ones, and
/// a sheet to write a new entry. `GET entries` sends `totalDebit` as a decimal
/// string and takes no status or search, so both run on the loaded rows.
struct AccountingTransactionsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rows: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var page = 1
    @State private var hasMore = false
    @State private var total: Int?
    @State private var filter = "all"
    @State private var search = ""
    @State private var creating = false
    @State private var rowsShown = false

    private static let statuses = [("draft", "Draft"), ("posted", "Posted"), ("void", "Void")]

    private var visible: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { row in
            (filter == "all" || row["status"]?.stringValue == filter)
                && (term.isEmpty
                    || (row["description"]?.stringValue ?? "").localizedCaseInsensitiveContains(term)
                    || (row["reference"]?.stringValue ?? "").localizedCaseInsensitiveContains(term)
                    || (row["entryNumber"]?.stringValue ?? "") == term.replacingOccurrences(of: "#", with: ""))
        }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Transactions")
            .navigationSubtitle(loaded ? "\(total ?? rows.count) entries" : "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Description, reference or #")
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
                    Button("New journal entry", systemImage: "plus") { creating = true }
                }
            }
            .task {
                await load()
                rowsShown = true
                #if DEBUG
                // Screenshots of the sheet: DUBBL_DEMO_SHEET=new-entry.
                if DemoData.isEnabled, ProcessInfo.processInfo.environment["DUBBL_DEMO_SHEET"] == "new-entry" { creating = true }
                #endif
            }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == AccountingCatalog.entriesKey { Task { await load() } }
            }
            .sheet(isPresented: $creating) {
                AccountingNewEntrySheet { Task { await load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if rows.isEmpty {
            Group {
                if let error {
                    ErrorStateView(message: error) { await load() }
                } else if loaded {
                    EmptyStateView(symbol: "list.bullet.rectangle", title: "No journal entries yet", message: "Invoices, bills and bank activity post here, and so do entries you write.", actionTitle: "New journal entry") { creating = true }
                } else {
                    ScrollView { SkeletonRows(rows: 9, avatar: false) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                if search.isEmpty {
                    LedgerTotals(items: totals)
                        .padding(.vertical, 14)
                        .ledgerRow()
                }
                ForEach(Array(visible.enumerated()), id: \.offset) { index, row in
                    Group {
                        if let id = row.recordID {
                            NavigationLink(value: RecordRoute(spec: AccountingCatalog.entriesKey, id: id)) {
                                AccountingEntryRow(row: row, currency: env.session.currency)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                        } else {
                            AccountingEntryRow(row: row, currency: env.session.currency)
                        }
                    }
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .contextMenu {
                        Button {
                            env.router.askTilly("Explain journal entry #\(row["entryNumber"]?.stringValue ?? "") (\(row["description"]?.stringValue ?? "")) and whether it looks right.", page: "accounting")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    }
                }
                if hasMore {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                    .frame(height: 44)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
                    .task { await loadMore() }
                } else {
                    LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "entry" : "entries")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await load() }
            .overlay {
                if visible.isEmpty {
                    EmptyStateView(symbol: "magnifyingglass", title: "Nothing here", message: search.isEmpty ? "No entries in this state." : "No entries match “\(search)”.")
                }
            }
        }
    }

    private var totals: [LedgerTotals.Item] {
        func sum(_ status: String) -> (Int, Int) {
            let matching = rows.filter { $0["status"]?.stringValue == status }
            return (matching.reduce(0) { $0 + AccountingAmount.minor($1["totalDebit"]) }, matching.count)
        }
        let drafts = sum("draft")
        let posted = sum("posted")
        return [
            .init(label: "Drafts", value: Money.short(drafts.0, currency: env.session.currency), detail: "\(drafts.1) to post", tint: DTheme.warning) { filter = filter == "draft" ? "all" : "draft" },
            .init(label: "Posted", value: Money.short(posted.0, currency: env.session.currency), detail: "\(posted.1) entries", tint: DTheme.positive) { filter = filter == "posted" ? "all" : "posted" },
        ]
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("entries", query: ["page": "1", "limit": "50"])
            withAnimation(.snappy) {
                rows = response["entries"]?.arrayValue ?? []
                total = response["pagination.total"]?.intValue ?? response["total"]?.intValue
                hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
                page = 1
                loaded = true
                error = nil
            }
        } catch {
            if rows.isEmpty { self.error = error.localizedDescription }
        }
    }

    private func loadMore() async {
        do {
            let response: JSONValue = try await env.api.get("entries", query: ["page": "\(page + 1)", "limit": "50"])
            let known = Set(rows.compactMap(\.recordID))
            rows += (response["entries"]?.arrayValue ?? []).filter { !known.contains($0.recordID ?? "") }
            hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
            page += 1
        } catch {
            hasMore = false
        }
    }
}

/// "Rent for October · #0142 · Bill · 1 Oct" with the total and status.
struct AccountingEntryRow: View {
    let row: JSONValue
    let currency: String

    static func source(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        let labels = ["manual": "Manual", "bank": "Bank", "credit_note": "Credit note", "debit_note": "Debit note", "opening_balance": "Opening balance", "fixed_asset": "Depreciation", "depreciation": "Depreciation", "loan": "Loan", "accrual": "Accrual", "recurring_journal": "Recurring"]
        return labels[value] ?? value.humanized
    }

    var body: some View {
        let status = row["status"]?.stringValue ?? "draft"
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(row["description"]?.stringValue ?? "Journal entry")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let number = row["entryNumber"]?.stringValue {
                        Text("#\(number)")
                            .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    Text([Self.source(row["sourceType"]?.stringValue) ?? "Manual", row["date"]?.stringValue.map(DubblDate.short)].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(AccountingAmount.minor(row["totalDebit"]), currency: currency))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(status == "void" ? DTheme.inkTertiary : DTheme.ink)
                    .strikethrough(status == "void")
                    .fixedSize()
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: AccountingEntryRow.tone(status))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "posted": .positive
        case "void": .negative
        default: .warning
        }
    }
}

// MARK: - Detail

/// One journal entry: its legs in debit and credit columns, where it came
/// from, and post, void or delete.
struct AccountingEntryDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var remote = AccountingRemote()
    @State private var working = false
    @State private var confirmingDelete = false
    @State private var voiding = false
    @State private var voidReason = ""

    private var entry: JSONValue? { remote.value?["entry"] }
    private var status: String { entry?["status"]?.stringValue ?? "draft" }
    private var currency: String { entry?["lines"]?.arrayValue?.first?["currencyCode"]?.stringValue ?? env.session.currency }

    var body: some View {
        AccountingLoadState(value: entry, error: remote.error, retry: load) { entry in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    AccountingHero(
                        number: entry["entryNumber"]?.stringValue.map { "#\($0)" },
                        status: (RecordFormat.statusLabel(status), AccountingEntryRow.tone(status)),
                        title: entry["description"]?.stringValue ?? "Journal entry",
                        amount: lines(entry).reduce(0) { $0 + $1.debit },
                        currency: currency,
                        caption: [entry["date"]?.stringValue.map(DubblDate.display), AccountingEntryRow.source(entry["sourceType"]?.stringValue)].compactMap { $0 }.joined(separator: " · ")
                    )
                    AccountingJournalCard(lines: lines(entry), currency: currency)
                    links(entry)
                    AccountingFacts(rows: [
                        ("Date", entry["date"]?.stringValue.map(DubblDate.display)),
                        ("Reference", entry["reference"]?.stringValue),
                        ("Source", AccountingEntryRow.source(entry["sourceType"]?.stringValue)),
                        ("Posted", entry["postedAt"]?.stringValue.flatMap(RecordFormat.date)),
                        ("Reverses on", entry["autoReverseDate"]?.stringValue.map(DubblDate.display)),
                        ("Voided", entry["voidedAt"]?.stringValue.flatMap(RecordFormat.date)),
                        ("Void reason", entry["voidReason"]?.stringValue),
                        ("Created", entry["createdAt"]?.stringValue.flatMap(RecordFormat.date)),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "void" ? 28 : 110)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Journal entry")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Explain journal entry #\(entry?["entryNumber"]?.stringValue ?? id) and whether it looks right.", page: "accounting")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if status == "draft" {
                        Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if entry != nil, status != "void" {
                AccountingActionBar {
                    if status == "draft" {
                        Button {
                            Task { await post() }
                        } label: {
                            HStack(spacing: 8) {
                                if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "checkmark.seal") }
                                Text("Post entry")
                            }
                        }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    } else {
                        Button {
                            voidReason = ""
                            voiding = true
                        } label: {
                            HStack(spacing: 8) {
                                if working { ProgressView().controlSize(.small).tint(DTheme.ink) } else { Image(systemName: "arrow.uturn.backward") }
                                Text("Void entry")
                            }
                        }
                        .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true, tone: .negative))
                    }
                }
                .disabled(working)
            }
        }
        .confirmationDialog("Delete this draft entry?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Void this entry?", isPresented: $voiding) {
            TextField("Reason", text: $voidReason)
            Button("Void", role: .destructive) { Task { await void() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("A reversing entry is posted so your reports stay right. Say why, for the audit trail.")
        }
        .task { await load() }
    }

    private func lines(_ entry: JSONValue) -> [AccountingJournalLine] {
        (entry["lines"]?.arrayValue ?? []).enumerated().map { index, line in
            AccountingJournalLine(
                id: line.recordID ?? "\(index)",
                code: line["accountCode"]?.stringValue ?? "",
                account: line["accountName"]?.stringValue ?? "Account",
                memo: line["description"]?.stringValue,
                debit: AccountingAmount.minor(line["debitAmount"]),
                credit: AccountingAmount.minor(line["creditAmount"])
            )
        }
    }

    /// Reversal pairs link to each other.
    @ViewBuilder
    private func links(_ entry: JSONValue) -> some View {
        let reverses = entry["reversesEntryId"]?.stringValue
        let reversedBy = entry["reversedByEntryId"]?.stringValue
        if reverses != nil || reversedBy != nil {
            CardStack {
                if let reverses {
                    linkRow("Reverses an earlier entry", id: reverses)
                }
                if let reversedBy {
                    linkRow("Reversed by a later entry", id: reversedBy)
                }
            }
        }
    }

    private func linkRow(_ title: String, id: String) -> some View {
        NavigationLink(value: RecordRoute(spec: AccountingCatalog.entriesKey, id: id)) {
            HStack(spacing: 12) {
                IconTile(symbol: "arrow.uturn.backward", size: 30)
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    private func load() async {
        await remote.load(env.api, "entries/\(id)")
    }

    private func post() async {
        await run("Entry posted") { let _: JSONValue = try await env.api.post("entries/\(id)/post", body: [String: JSONValue]()) }
    }

    private func void() async {
        let reason = voidReason.trimmingCharacters(in: .whitespaces)
        await run("Entry voided") {
            let _: JSONValue = try await env.api.post("entries/\(id)/void", body: ["reason": JSONValue.string(reason.isEmpty ? "Voided from the app" : reason)])
        }
    }

    private func delete() async {
        await run("Entry deleted", popsBack: true) { let _: JSONValue = try await env.api.delete("entries/\(id)") }
    }

    private func run(_ done: String, popsBack: Bool = false, _ call: () async throws -> Void) async {
        working = true
        defer { working = false }
        do {
            try await call()
            env.toast.show(done)
            AccountingPost.changed(AccountingCatalog.entriesKey)
            if popsBack { dismiss() } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }
}

// MARK: - New entry

/// Write a manual journal: date, what it's for, and balanced legs. Saved as a
/// draft, then posted unless "Post now" is off.
struct AccountingNewEntrySheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var memo = ""
    @State private var reference = ""
    @State private var lines = [AccountingLineDraft(isDebit: true), AccountingLineDraft(isDebit: false)]
    @State private var postNow = true
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        !memo.trimmingCharacters(in: .whitespaces).isEmpty && lines.isComplete && lines.isBalanced
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Description") {
                            TextField("What this entry is for", text: $memo)
                        }
                        AccountingDateRow(label: "Date", date: $date)
                        FieldRow(label: "Reference") {
                            TextField("Optional", text: $reference)
                        }
                    }
                    AccountingLinesEditor(lines: $lines, currency: env.session.currency)
                    CardStack {
                        Toggle(isOn: $postNow) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Post now")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Text(postNow ? "It hits your reports straight away." : "Saved as a draft to check first.")
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        .tint(DTheme.positive)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "New journal entry", saveTitle: postNow ? "Post" : "Save", canSave: canSave, saving: saving, save: save)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let currency = env.session.currency
        var body: [String: JSONValue] = [
            "date": .string(AccountingDay.string(date)),
            "description": .string(memo.trimmingCharacters(in: .whitespaces)),
            "lines": .array(lines.map { line in
                .object([
                    "accountId": .string(line.account?.id ?? ""),
                    "description": line.memo.isEmpty ? .null : .string(line.memo),
                    "debitAmount": .number(Double(line.isDebit ? line.amount : 0)),
                    "creditAmount": .number(Double(line.isDebit ? 0 : line.amount)),
                    "currencyCode": .string(currency),
                ])
            }),
        ]
        let ref = reference.trimmingCharacters(in: .whitespaces)
        if !ref.isEmpty { body["reference"] = .string(ref) }
        do {
            let response: JSONValue = try await env.api.post("entries", body: body)
            if postNow, let id = response["entry.id"]?.stringValue {
                let _: JSONValue = try await env.api.post("entries/\(id)/post", body: [String: JSONValue]())
            }
            env.toast.show(postNow ? "Entry posted" : "Draft saved")
            AccountingPost.changed(AccountingCatalog.entriesKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
