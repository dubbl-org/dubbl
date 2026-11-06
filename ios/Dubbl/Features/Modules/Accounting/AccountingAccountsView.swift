import SwiftUI

/// The chart of accounts grouped by type, each with its balance today. The
/// accounts route has no balances, so they come from the trial balance
/// (natural sign: positive is the account's normal side).
struct AccountingAccountsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var accounts = AccountingRemote()
    @State private var trial = AccountingRemote()
    @State private var search = ""
    @State private var hideEmpty = false
    @State private var showInactive = false
    @State private var creating = false

    private var currency: String { env.session.currency }

    /// Balances by account id, and by "#code" for accounts the trial balance
    /// lists under another id (codes are unique within an organization).
    private var balances: [String: Int] {
        var map = [String: Int]()
        for row in trial.value?["accounts"]?.arrayValue ?? [] {
            let amount = AccountingAmount.minor(row["balance"])
            if let id = row["accountId"]?.stringValue { map[id] = amount }
            if let code = row["code"]?.stringValue { map["#" + code] = amount }
        }
        return map
    }

    private func balance(_ row: JSONValue, in map: [String: Int]) -> Int {
        map[row.recordID ?? ""] ?? map["#" + (row["code"]?.stringValue ?? "")] ?? 0
    }

    private var rows: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        let balances = balances
        return (accounts.value?["accounts"]?.arrayValue ?? []).filter { row in
            (showInactive || row["isActive"]?.boolValue != false)
                && (!hideEmpty || balance(row, in: balances) != 0)
                && (term.isEmpty
                    || (row["name"]?.stringValue ?? "").localizedCaseInsensitiveContains(term)
                    || (row["code"]?.stringValue ?? "").hasPrefix(term))
        }
    }

    var body: some View {
        AccountingLoadState(value: accounts.value, error: accounts.error, retry: load) { _ in
            List {
                if search.isEmpty {
                    LedgerTotals(items: ["asset", "liability", "equity"].map { type in
                        .init(label: AccountingAccountType.title(type), value: trial.value == nil ? nil : Money.short(total(type), currency: currency), detail: "\(count(type)) accounts", tint: AccountingAccountType.tone(type).color)
                    })
                    .padding(.vertical, 14)
                    .ledgerRow()
                }
                ForEach(AccountingAccountType.order, id: \.self) { type in
                    let group = rows.filter { $0["type"]?.stringValue == type }
                    if !group.isEmpty {
                        Section {
                            ForEach(group, id: \.self) { row in
                                NavigationLink(value: RecordRoute(spec: AccountingCatalog.accountsKey, id: row.recordID ?? "")) {
                                    AccountingAccountRow(row: row, balance: trial.value == nil ? nil : balance(row, in: balances), currency: currency)
                                }
                                .navigationLinkIndicatorVisibility(.hidden)
                                .ledgerRow()
                            }
                        } header: {
                            HStack(alignment: .firstTextBaseline) {
                                Text(AccountingAccountType.title(type))
                                    .font(.system(size: 13.5, weight: .semibold))
                                    .foregroundStyle(DTheme.ink)
                                Text("\(group.count)")
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkTertiary)
                                Spacer()
                                if trial.value != nil {
                                    Text(Money.format(group.reduce(0) { $0 + balance($1, in: balances) }, currency: currency))
                                        .font(.system(size: 13.5, weight: .semibold, design: .rounded))
                                        .monospacedDigit()
                                        .foregroundStyle(DTheme.inkSecondary)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
                LedgerEndMarker(text: "\(rows.count) accounts")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await load() }
            .overlay {
                if rows.isEmpty {
                    EmptyStateView(symbol: "list.number", title: "Nothing here", message: search.isEmpty ? "No accounts with a balance." : "No accounts match “\(search)”.")
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Chart of accounts")
        .navigationSubtitle(trial.value?["asAt"]?.stringValue.map { "Balances at \(DubblDate.short($0))" } ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Name or code")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Hide zero balances", isOn: $hideEmpty)
                    Toggle("Show archived", isOn: $showInactive)
                } label: {
                    Image(systemName: hideEmpty || showInactive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease")
                }
                .accessibilityLabel("Filter accounts")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("New account", systemImage: "plus") { creating = true }
            }
        }
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == AccountingCatalog.accountsKey { Task { await load() } }
        }
        .sheet(isPresented: $creating) {
            AccountingNewAccountSheet { Task { await load() } }
        }
    }

    private func total(_ type: String) -> Int {
        let balances = balances
        return (accounts.value?["accounts"]?.arrayValue ?? [])
            .filter { $0["type"]?.stringValue == type }
            .reduce(0) { $0 + balance($1, in: balances) }
    }

    private func count(_ type: String) -> Int {
        (accounts.value?["accounts"]?.arrayValue ?? []).filter { $0["type"]?.stringValue == type && $0["isActive"]?.boolValue != false }.count
    }

    private func load() async {
        async let chart: Void = accounts.load(env.api, "accounts")
        async let balances: Void = trial.load(env.api, "reports/trial-balance")
        _ = await (chart, balances)
    }
}

/// "1100  Cash at bank · Current asset          $12,400.00"
struct AccountingAccountRow: View {
    let row: JSONValue
    let balance: Int?
    let currency: String

    var body: some View {
        let inactive = row["isActive"]?.boolValue == false
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(row["code"]?.stringValue ?? "")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(DTheme.inkTertiary)
                .frame(minWidth: 44, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(row["name"]?.stringValue ?? "Account")
                    .font(.system(size: 15.5, weight: .medium))
                    .foregroundStyle(inactive ? DTheme.inkTertiary : DTheme.ink)
                    .lineLimit(1)
                let detail = [row["subType"]?.stringValue.map(\.humanized), inactive ? "Archived" : nil].compactMap { $0 }
                if !detail.isEmpty {
                    Text(detail.joined(separator: " · "))
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let balance {
                Text(Money.format(balance, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(balance == 0 ? DTheme.inkTertiary : DTheme.ink)
                    .fixedSize()
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Account detail

/// One account: its balance, debits and credits to date, and the posted
/// entries that make it up (newest first, each opening its journal entry).
struct AccountingAccountDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var remote = AccountingRemote()
    @State private var working = false

    private var account: JSONValue? { remote.value?["account"] }
    private var currency: String { account?["currencyCode"]?.stringValue ?? env.session.currency }

    var body: some View {
        AccountingLoadState(value: account, error: remote.error, retry: load) { account in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    let type = account["type"]?.stringValue ?? ""
                    AccountingHero(
                        number: account["code"]?.stringValue,
                        status: (AccountingAccountType.singular(type), AccountingAccountType.tone(type)),
                        title: account["name"]?.stringValue ?? "Account",
                        amount: account["balance"]?.intValue ?? 0,
                        currency: currency,
                        caption: account["isActive"]?.boolValue == false ? "Archived" : account["subType"]?.stringValue?.humanized
                    )
                    AccountingFigures(items: [
                        .init(label: "Debits", value: Money.short(account["totalDebits"]?.intValue ?? 0, currency: currency)),
                        .init(label: "Credits", value: Money.short(account["totalCredits"]?.intValue ?? 0, currency: currency)),
                        .init(label: "Entries", value: "\(account["entryCount"]?.intValue ?? 0)"),
                    ])
                    ledger
                    AccountingFacts(rows: [
                        ("Type", AccountingAccountType.singular(type)),
                        ("Sub type", account["subType"]?.stringValue?.humanized),
                        ("Currency", account["currencyCode"]?.stringValue),
                        ("Reporting code", account["reportingCode"]?.stringValue),
                        ("Built in", account["isSystem"]?.boolValue == true ? "Yes, name and code are locked" : nil),
                        ("Description", account["description"]?.stringValue),
                    ])
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("What's been moving in account \(account?["code"]?.stringValue ?? "") \(account?["name"]?.stringValue ?? "")?", page: "accounting")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if let active = account?["isActive"]?.boolValue {
                        Button(active ? "Archive" : "Restore", systemImage: active ? "archivebox" : "arrow.uturn.backward") {
                            Task { await setActive(!active) }
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
                .disabled(working)
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var ledger: some View {
        let rows = remote.value?["data"]?.arrayValue ?? []
        if rows.isEmpty {
            CardStack {
                Text("No posted entries yet.")
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }
        } else {
            let total = remote.value?["pagination.total"]?.intValue ?? rows.count
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(total > rows.count ? "Latest \(rows.count) of \(total)" : "Entries · \(rows.count)")
                CardStack {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        NavigationLink(value: RecordRoute(spec: AccountingCatalog.entriesKey, id: row["entryId"]?.stringValue ?? "")) {
                            ledgerRow(row)
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
    }

    private func ledgerRow(_ row: JSONValue) -> some View {
        let debit = row["debitAmount"]?.intValue ?? 0
        let credit = row["creditAmount"]?.intValue ?? 0
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row["description"]?.stringValue ?? "Entry")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let number = row["entryNumber"]?.stringValue {
                        Text("#\(number)")
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    Text(DubblDate.short(row["date"]?.stringValue))
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text((debit > 0 ? "Dr " : "Cr ") + Money.format(debit > 0 ? debit : credit, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                if let balance = row["balance"]?.intValue {
                    Text(Money.format(balance, currency: currency))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func load() async {
        await remote.load(env.api, "accounts/\(id)", query: ["page": "1", "limit": "50"])
    }

    private func setActive(_ active: Bool) async {
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.patch("accounts/\(id)", body: ["isActive": JSONValue.bool(active)])
            env.toast.show(active ? "Account restored" : "Account archived")
            AccountingPost.changed(AccountingCatalog.accountsKey)
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

// MARK: - New account

/// Add an account to the chart: code, name, type and an optional note.
struct AccountingNewAccountSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var name = ""
    @State private var type = "expense"
    @State private var note = ""
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        !code.trimmingCharacters(in: .whitespaces).isEmpty && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. Software subscriptions", text: $name)
                        }
                        FieldRow(label: "Code") {
                            TextField("e.g. 6420", text: $code)
                                .keyboardType(.numbersAndPunctuation)
                                .font(.system(size: 16, design: .monospaced))
                        }
                        HStack {
                            Text("Type")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Type", selection: $type) {
                                ForEach(AccountingAccountType.order, id: \.self) { type in
                                    Text(AccountingAccountType.singular(type)).tag(type)
                                }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(minHeight: 50)
                    }
                    CardStack {
                        FieldRow(label: "Description") {
                            TextField("Optional", text: $note, axis: .vertical)
                                .lineLimit(1 ... 4)
                        }
                    }
                    AccountingFormError(message: error)
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .accountingFormChrome(title: "New account", saveTitle: "Add", canSave: canSave, saving: saving, save: save)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "code": .string(code.trimmingCharacters(in: .whitespaces)),
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "type": .string(type),
            "currencyCode": .string(env.session.currency),
        ]
        let description = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !description.isEmpty { body["description"] = .string(description) }
        do {
            let _: JSONValue = try await env.api.post("accounts", body: body)
            env.toast.show("Account added")
            AccountingPost.changed(AccountingCatalog.accountsKey)
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
