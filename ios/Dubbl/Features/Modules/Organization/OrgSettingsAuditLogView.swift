import SwiftUI

/// /settings/audit-log: who changed what and when, newest first, by day.
/// Filter by action; tap an entry for the before and after of each field.
/// Owners and admins only; history length follows the plan.
struct OrgSettingsAuditLogView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var entries: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var hasMore = false
    @State private var page = 1
    @State private var action = "all"
    @State private var entityType = "all"
    @State private var selected: OrgSettingsIdentified?

    static let actions: [(value: String, label: String)] = [
        ("all", "All actions"), ("create", "Created"), ("update", "Updated"), ("delete", "Deleted"), ("restore", "Restored"),
        ("purge", "Deleted forever"), ("approve", "Approved"), ("reject", "Rejected"), ("send", "Sent"), ("void", "Voided"),
        ("post", "Posted"), ("import", "Imported"), ("restore_backup", "Backup restored"),
    ]

    static let entityTypes: [(value: String, label: String)] = [
        ("all", "Everything"), ("invoice", "Invoices"), ("bill", "Bills"), ("contact", "Contacts"), ("payment", "Payments"),
        ("expense", "Expenses"), ("journal_entry", "Journal entries"), ("bank_rule", "Bank rules"), ("member", "Members"),
        ("role", "Roles"), ("organization", "Organization"), ("api_key", "API keys"), ("webhook", "Webhooks"),
    ]

    private var canView: Bool { OrgSettingsAccess.allows(.admin, env) }

    /// Fixtures ignore query strings, so filter on the device in demo mode.
    private var visible: [JSONValue] {
        var rows = entries
        #if DEBUG
        if DemoData.isEnabled {
            if action != "all" { rows = rows.filter { $0.orgString("action") == action } }
            if entityType != "all" { rows = rows.filter { $0.orgString("entityType") == entityType } }
        }
        #endif
        return rows
    }

    private var days: [(day: String, rows: [JSONValue])] {
        var order: [String] = []
        var groups: [String: [JSONValue]] = [:]
        for row in visible {
            let day = String((row.orgString("createdAt") ?? "").prefix(10))
            if groups[day] == nil { order.append(day) }
            groups[day, default: []].append(row)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Audit log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if canView {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Action", selection: $action) {
                                ForEach(Self.actions, id: \.value) { Text($0.label).tag($0.value) }
                            }
                            Picker("Record", selection: $entityType) {
                                ForEach(Self.entityTypes, id: \.value) { Text($0.label).tag($0.value) }
                            }
                        } label: {
                            Image(systemName: action == "all" && entityType == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                        }
                        .accessibilityLabel("Filter")
                    }
                }
            }
            .sheet(item: $selected) { item in
                OrgSettingsAuditEntrySheet(entry: item.value)
            }
            .task {
                if canView { await load() }
                #if DEBUG
                OrgSettingsDemo.open("entry") { selected = entries.first.map(OrgSettingsIdentified.init) }
                #endif
            }
            .onChange(of: action) { _, _ in Task { await load() } }
            .onChange(of: entityType) { _, _ in Task { await load() } }
    }

    @ViewBuilder
    private var content: some View {
        if !canView {
            EmptyStateView(symbol: "lock", title: "Admins only", message: "Ask an owner or admin to look at the audit log.")
                .frame(maxHeight: .infinity)
        } else if visible.isEmpty {
            Group {
                if let error {
                    ErrorStateView(message: error) { await load() }
                } else if loaded {
                    EmptyStateView(symbol: "clock.arrow.circlepath", title: "Nothing logged", message: "Changes people make show up here.")
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                ForEach(days, id: \.day) { group in
                    Section {
                        ForEach(group.rows, id: \.recordID) { entry in
                            Button { selected = OrgSettingsIdentified(value: entry) } label: { row(entry) }
                                .buttonStyle(.plain)
                                .ledgerRow()
                        }
                    } header: {
                        Text(DubblDate.display(group.day))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.leading, 4)
                    }
                }
                if hasMore {
                    HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
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
            .refreshable { await load() }
        }
    }

    private func row(_ entry: JSONValue) -> some View {
        let who = entry.orgString("userName") ?? "Someone"
        let verb = Self.verb(entry.orgText("action"))
        let what = entry.orgText("entityType").replacingOccurrences(of: "_", with: " ")
        let fields = entry["changes.diff"]?.objectValue?.keys.sorted() ?? []
        return HStack(alignment: .top, spacing: 12) {
            Avatar(name: who, size: 32)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(Text(who).fontWeight(.semibold)) \(verb) \(Self.article(what)) \(what)")
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                if !fields.isEmpty {
                    Text(fields.prefix(4).map(RecordFormat.label).joined(separator: ", ") + (fields.count > 4 ? " +\(fields.count - 4)" : ""))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(DubblDate.parseMoment(entry.orgString("createdAt"))?.formatted(.dateTime.hour().minute()) ?? "")
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    static func verb(_ action: String) -> String {
        let verbs = [
            "create": "created", "update": "updated", "delete": "deleted", "restore": "restored", "purge": "permanently deleted",
            "approve": "approved", "reject": "rejected", "send": "sent", "void": "voided", "post": "posted", "pay": "paid",
            "import": "imported", "merge": "merged", "convert": "converted", "apply": "applied", "submit": "submitted",
            "submit_for_approval": "submitted for approval", "restore_backup": "restored a backup of",
        ]
        return verbs[action] ?? action.replacingOccurrences(of: "_", with: " ")
    }

    private static func article(_ noun: String) -> String {
        guard let first = noun.first?.lowercased() else { return "a" }
        return "aeiou".contains(first) ? "an" : "a"
    }

    // MARK: Data

    private func query(page: Int) -> [String: String?] {
        var query: [String: String?] = ["page": "\(page)", "limit": "50"]
        if action != "all" { query["action"] = action }
        if entityType != "all" { query["entityType"] = entityType }
        return query
    }

    private func load() async {
        do {
            let response = try await OrgSettingsAPI.get(env, "audit-log", query: query(page: 1))
            withAnimation(.snappy) {
                entries = response.orgArray("data")
                page = 1
                hasMore = (response.orgInt("pagination.page") ?? 1) < (response.orgInt("pagination.totalPages") ?? 1)
                loaded = true
                error = nil
            }
        } catch {
            if error is CancellationError { return }
            if entries.isEmpty { self.error = error.localizedDescription }
        }
    }

    private func loadMore() async {
        guard let response = try? await OrgSettingsAPI.get(env, "audit-log", query: query(page: page + 1)) else {
            hasMore = false
            return
        }
        let known = Set(entries.compactMap(\.recordID))
        entries += response.orgArray("data").filter { !known.contains($0.recordID ?? "") }
        page += 1
        hasMore = (response.orgInt("pagination.page") ?? 1) < (response.orgInt("pagination.totalPages") ?? 1)
    }
}

/// One audit entry: who, when, from where, and each field's before and after.
struct OrgSettingsAuditEntrySheet: View {
    let entry: JSONValue
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env

    private var diff: [(field: String, from: JSONValue?, to: JSONValue?)] {
        (entry["changes.diff"]?.objectValue ?? [:]).keys.sorted().map { key in
            (key, entry["changes.diff.\(key).from"], entry["changes.diff.\(key).to"])
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    OrgSettingsSection(nil) {
                        DetailRow("Who", entry.orgString("userName") ?? "Unknown")
                        DetailRow("Did", OrgSettingsAuditLogView.verb(entry.orgText("action")).humanized)
                        DetailRow("To", entry.orgText("entityType").humanized)
                        DetailRow("When", DubblDate.parseMoment(entry.orgString("createdAt"))?.formatted(.dateTime.day().month(.abbreviated).year().hour().minute().second()) ?? "")
                        if let ip = entry.orgString("ipAddress") { DetailRow("IP address", ip) }
                    }
                    if !diff.isEmpty {
                        OrgSettingsSection("Changes") {
                            ForEach(diff, id: \.field) { change in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(RecordFormat.label(change.field))
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(DTheme.inkSecondary)
                                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                                        Text(text(change.from, key: change.field))
                                            .strikethrough(change.from != nil && change.from?.isNull == false, color: DTheme.inkTertiary)
                                            .foregroundStyle(DTheme.inkTertiary)
                                        Image(systemName: "arrow.right")
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundStyle(DTheme.inkTertiary)
                                        Text(text(change.to, key: change.field))
                                            .foregroundStyle(DTheme.ink)
                                    }
                                    .font(.system(size: 15))
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    } else if let changes = entry["changes"], !changes.isNull, !changes.isEmpty {
                        OrgSettingsSection("Details") {
                            Text(changes.pretty)
                                .font(.system(size: 12.5, design: .monospaced))
                                .foregroundStyle(DTheme.inkSecondary)
                                .textSelection(.enabled)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if let agent = entry.orgString("userAgent") {
                        Text(agent)
                            .font(.system(size: 12))
                            .foregroundStyle(DTheme.inkTertiary)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(16)
            }
            .background(DTheme.shell)
            .navigationTitle("Change")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func text(_ value: JSONValue?, key: String) -> String {
        guard let value, !value.isNull else { return "Empty" }
        return RecordFormat.text(value, key: key, record: .object([:]), spec: nil, currency: env.session.currency) ?? value.pretty
    }
}
