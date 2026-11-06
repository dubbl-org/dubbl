import SwiftUI

/// /settings/trash: everything deleted in the last 30 days. Swipe to restore
/// or delete forever; the owner can empty the whole trash.
struct OrgSettingsTrashView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var items: [JSONValue] = []
    @State private var total = 0
    @State private var loaded = false
    @State private var error: String?
    @State private var type = "all"
    @State private var search = ""
    @State private var confirmation: OrgSettingsConfirmation?
    @State private var page = 1

    static let types: [(value: String, label: String)] = [
        ("all", "Everything"), ("invoice", "Invoices"), ("bill", "Bills"), ("contact", "Contacts"), ("quote", "Quotes"),
        ("expense", "Expenses"), ("payment", "Payments"), ("credit_note", "Credit notes"), ("debit_note", "Debit notes"),
        ("purchase_order", "Purchase orders"), ("journal_entry", "Journal entries"), ("account", "Accounts"), ("product", "Products"),
        ("bank_account", "Bank accounts"), ("project", "Projects"), ("fixed_asset", "Fixed assets"), ("budget", "Budgets"),
        ("loan", "Loans"), ("recurring_template", "Recurring templates"), ("document", "Documents"),
        ("document_template", "Templates"), ("data_backup", "Backups"),
    ]

    static let symbols: [String: String] = [
        "invoice": "doc.text", "bill": "doc.plaintext", "contact": "person", "quote": "doc.plaintext", "expense": "creditcard",
        "payment": "arrow.down.circle", "credit_note": "arrow.uturn.left", "debit_note": "arrow.uturn.right", "purchase_order": "shippingbox",
        "journal_entry": "book.closed", "account": "list.number", "product": "cube", "bank_account": "building.columns",
        "project": "folder", "fixed_asset": "desktopcomputer", "budget": "chart.bar", "loan": "banknote", "document": "paperclip",
        "recurring_template": "repeat", "document_template": "doc.richtext", "data_backup": "externaldrive",
    ]

    private var visible: [JSONValue] {
        var rows = items
        #if DEBUG
        // Fixtures ignore query strings, so filter on the device in demo mode.
        if DemoData.isEnabled {
            if type != "all" { rows = rows.filter { $0.orgString("entityType") == type } }
            if !search.isEmpty { rows = rows.filter { ($0.orgString("name") ?? "").localizedCaseInsensitiveContains(search) } }
        }
        #endif
        return rows
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Trash")
            .navigationSubtitle(loaded ? "\(total) \(total == 1 ? "item" : "items")" : "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search deleted items")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Type", selection: $type) {
                            ForEach(Self.types, id: \.value) { Text($0.label).tag($0.value) }
                        }
                        if OrgSettingsAccess.allows(.owner, env), !items.isEmpty {
                            Divider()
                            Button("Empty trash", systemImage: "trash.slash", role: .destructive) {
                                confirmation = OrgSettingsConfirmation(title: "Empty the trash?", message: "Everything in it is deleted for good. This can't be undone.", action: "Empty trash") {
                                    if await OrgSettingsRun.run(env, "Trash emptied", { try await OrgSettingsAPI.send(env, .post, "trash/empty") }) {
                                        await load()
                                    }
                                }
                            }
                        }
                    } label: {
                        Image(systemName: type == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter and empty")
                }
            }
            .orgSettingsConfirm($confirmation)
            .onChange(of: type) { _, _ in Task { await load() } }
            .task(id: search) {
                // Runs on appear too; only typing waits for a pause.
                if !search.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
                if Task.isCancelled { return }
                await load()
            }
    }

    @ViewBuilder
    private var content: some View {
        if visible.isEmpty {
            Group {
                if let error {
                    ErrorStateView(message: error) { await load() }
                } else if loaded {
                    EmptyStateView(symbol: "trash", title: "Trash is empty", message: "Deleted items stay here for 30 days.")
                } else {
                    ScrollView { SkeletonRows(rows: 8) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                ForEach(visible, id: \.recordID) { item in
                    row(item)
                        .ledgerRow()
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", systemImage: "trash", role: .destructive) { confirmDelete(item) }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button("Restore", systemImage: "arrow.uturn.backward") { Task { await restore(item) } }
                                .tint(DTheme.positive)
                        }
                        .contextMenu {
                            Button("Restore", systemImage: "arrow.uturn.backward") { Task { await restore(item) } }
                            Button("Delete forever", systemImage: "trash", role: .destructive) { confirmDelete(item) }
                        }
                }
                if items.count < total {
                    HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
                        .frame(height: 44)
                        .listRowBackground(DTheme.canvas)
                        .listRowSeparator(.hidden)
                        .task { await loadMore() }
                } else {
                    LedgerEndMarker(text: "Kept for 30 days")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
        }
    }

    private func row(_ item: JSONValue) -> some View {
        let type = item.orgText("entityType")
        let deleted = item.orgString("deletedAt")
        let left = DubblDate.parseMoment(deleted).map { 30 - (Calendar.current.dateComponents([.day], from: $0, to: .now).day ?? 0) }
        return HStack(spacing: 12) {
            IconTile(symbol: Self.symbols[type] ?? "doc", size: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.orgString("name") ?? "Untitled")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([item.orgString("label"), "deleted \(DubblDate.relative(deleted).lowercased())"].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let left {
                Text("\(max(left, 0))d left")
                    .font(.system(size: 12.5, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(left <= 5 ? DTheme.negative : DTheme.inkTertiary)
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: Actions

    private func restore(_ item: JSONValue) async {
        guard let id = item.recordID else { return }
        let ok = await OrgSettingsRun.run(env, "\(item.orgString("label") ?? "Item") restored") {
            try await OrgSettingsAPI.send(env, .post, "trash/\(id)/restore", body: ["entityType": .string(item.orgText("entityType"))])
        }
        if ok { remove(id) }
    }

    private func confirmDelete(_ item: JSONValue) {
        guard let id = item.recordID else { return }
        confirmation = OrgSettingsConfirmation(title: "Delete \(item.orgString("name") ?? "this item") forever?", message: "This can't be undone.", action: "Delete forever") {
            let ok = await OrgSettingsRun.run(env, "Deleted forever") {
                try await OrgSettingsAPI.send(env, .delete, "trash/\(id)", body: ["entityType": .string(item.orgText("entityType"))])
            }
            if ok { remove(id) }
        }
    }

    private func remove(_ id: String) {
        withAnimation(.snappy) {
            items.removeAll { $0.recordID == id }
            total = max(0, total - 1)
        }
    }

    // MARK: Data

    private var query: [String: String?] {
        var query: [String: String?] = ["limit": "50", "page": "\(page)"]
        if type != "all" { query["entityType"] = type }
        let term = search.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { query["search"] = term }
        return query
    }

    private func load() async {
        page = 1
        do {
            let response = try await OrgSettingsAPI.get(env, "trash", query: query)
            withAnimation(.snappy) {
                items = response.orgArray("data")
                total = response.orgInt("total") ?? items.count
                loaded = true
                error = nil
            }
        } catch {
            if error is CancellationError { return }
            if items.isEmpty { self.error = error.localizedDescription }
        }
    }

    private func loadMore() async {
        page += 1
        guard let response = try? await OrgSettingsAPI.get(env, "trash", query: query) else {
            total = items.count
            return
        }
        let known = Set(items.compactMap(\.recordID))
        let fresh = response.orgArray("data").filter { !known.contains($0.recordID ?? "") }
        if fresh.isEmpty { total = items.count }
        items += fresh
    }
}
