import SwiftUI

extension Notification.Name {
    /// Posted with the spec key as `object` after a record changes.
    static let recordsChanged = Notification.Name("dubbl.recordsChanged")
}

/// One page of any record kind, filtered by status and search.
@MainActor @Observable
final class RecordListStore {
    enum Phase { case idle, loading, loaded, failed(String) }

    let spec: RecordSpec
    private(set) var rows: [JSONValue] = []
    private(set) var phase: Phase = .idle
    private(set) var hasMore = false
    private(set) var total: Int?
    var filter = "all"
    var search = ""

    private var page = 1
    private var generation = 0
    private static let limit = 40

    init(spec: RecordSpec) {
        self.spec = spec
    }

    var hasLoaded: Bool {
        if case .loaded = phase { return true }
        return false
    }

    var errorMessage: String? {
        if case let .failed(message) = phase { return message }
        return nil
    }

    private var term: String { search.trimmingCharacters(in: .whitespaces) }

    /// Demo fixtures ignore query strings, so search runs on the device there.
    private static var demo: Bool {
        #if DEBUG
        DemoData.isEnabled
        #else
        false
        #endif
    }

    /// Rows after on-device search, for specs the server can't search.
    var visibleRows: [JSONValue] {
        guard spec.searchParam == nil || Self.demo, !term.isEmpty else { return rows }
        return rows.filter { row in
            (spec.row.title + spec.row.subtitle + [spec.row.number].compactMap { $0 })
                .compactMap { row[$0].flatMap { RecordFormat.text($0, key: "", record: row, spec: spec, currency: "") } }
                .contains { $0.localizedCaseInsensitiveContains(term) }
        }
    }

    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        if rows.isEmpty { phase = .loading }
        do {
            let response: JSONValue = try await api.get(spec.endpoint, query: query(page: 1))
            guard current == generation else { return }
            var fresh = Self.rows(in: response, key: spec.listKey)
            #if DEBUG
            // Fixtures ignore query strings, so filter here to keep demo screens honest.
            if DemoData.isEnabled, filter != "all", let path = spec.row.status {
                fresh = fresh.filter { $0[path]?.stringValue == filter }
            }
            #endif
            withAnimation(.snappy) {
                rows = fresh
                hasMore = spec.paged && Self.hasMore(response)
                total = response["pagination.total"]?.intValue ?? (spec.paged ? nil : fresh.count)
                page = 1
                phase = .loaded
            }
        } catch {
            guard current == generation, !(error is CancellationError) else { return }
            rows = []
            phase = .failed(error.localizedDescription)
        }
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore else { return }
        let current = generation
        do {
            let response: JSONValue = try await api.get(spec.endpoint, query: query(page: page + 1))
            guard current == generation else { return }
            let known = Set(rows.compactMap(\.recordID))
            rows += Self.rows(in: response, key: spec.listKey).filter { !known.contains($0.recordID ?? UUID().uuidString) }
            hasMore = Self.hasMore(response)
            page += 1
        } catch {
            hasMore = false
        }
    }

    /// Sum of a minor-unit field over loaded rows, optionally by status.
    func sum(_ total: RecordTotal) -> Int {
        rows.reduce(0) { sum, row in
            if let statuses = total.statuses, let path = spec.row.status, !statuses.contains(row[path]?.stringValue ?? "") { return sum }
            return sum + (row[total.field]?.intValue ?? 0)
        }
    }

    private func query(page: Int) -> [String: String?] {
        var query: [String: String?] = spec.query.mapValues { $0 }
        if spec.paged {
            query["page"] = "\(page)"
            query["limit"] = "\(Self.limit)"
        }
        if filter != "all" { query[spec.statusParam] = filter }
        if let param = spec.searchParam, !term.isEmpty { query[param] = term }
        return query
    }

    static func rows(in response: JSONValue, key: String?) -> [JSONValue] {
        if let key, let rows = response[key]?.arrayValue { return rows }
        if let rows = response["data"]?.arrayValue { return rows }
        if let rows = response.arrayValue { return rows }
        // `{ things: [...] }` with one array inside.
        if case let .object(object) = response, let rows = object.values.compactMap(\.arrayValue).first { return rows }
        return []
    }

    private static func hasMore(_ response: JSONValue) -> Bool {
        guard let page = response["pagination.page"]?.intValue, let pages = response["pagination.totalPages"]?.intValue else { return false }
        return page < pages
    }
}

/// Any record kind as a native list: title and count in the bar, status
/// filters in a menu, search, totals and ledger rows that open the detail.
struct RecordListView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var store: RecordListStore
    @State private var creating = false
    @State private var rowsShown = false

    private var spec: RecordSpec { store.spec }

    init(spec: RecordSpec) {
        _store = State(initialValue: RecordListStore(spec: spec))
    }

    var body: some View {
        @Bindable var store = store
        content
            .background(DTheme.canvas)
            .navigationTitle(spec.title)
            .navigationSubtitle(subtitle)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $store.search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search \(spec.title.lowercased())")
            .toolbar {
                if !spec.statuses.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Status", selection: $store.filter) {
                                Text("All").tag("all")
                                ForEach(spec.statuses, id: \.value) { status in
                                    Text(status.label).tag(status.value)
                                }
                            }
                        } label: {
                            Image(systemName: store.filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                        }
                        .accessibilityLabel("Filter by status")
                    }
                }
                if spec.create != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("New \(spec.singular.lowercased())", systemImage: "plus") { creating = true }
                    }
                }
            }
            .task { await reload() }
            .onChange(of: store.filter) { _, _ in Task { await reload() } }
            .task(id: store.search) {
                guard spec.searchParam != nil else { return }
                try? await Task.sleep(for: .milliseconds(300))
                if Task.isCancelled { return }
                await store.load(env.api)
            }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == spec.key { Task { await store.load(env.api) } }
            }
            .sheet(isPresented: $creating) {
                if let create = spec.create {
                    create { Task { await store.load(env.api) } }
                }
            }
    }

    private var subtitle: String {
        guard store.hasLoaded else { return "" }
        let count = store.total ?? store.rows.count
        let scope = store.filter == "all" ? "" : (spec.statuses.first { $0.value == store.filter }?.label.lowercased()).map { " \($0)" } ?? ""
        return "\(count)\(store.hasMore && store.total == nil ? "+" : "")\(scope)"
    }

    private func reload() async {
        rowsShown = false
        await store.load(env.api)
        rowsShown = true
    }

    @ViewBuilder
    private var content: some View {
        if store.rows.isEmpty {
            Group {
                if let message = store.errorMessage {
                    ErrorStateView(message: message) { await store.load(env.api) }
                } else if store.hasLoaded {
                    EmptyStateView(
                        symbol: spec.symbol,
                        title: store.filter == "all" ? "No \(spec.title.lowercased()) yet" : "Nothing here",
                        message: store.filter == "all" ? spec.emptyMessage : "No \(spec.title.lowercased()) in this state.",
                        actionTitle: spec.create != nil && store.filter == "all" ? "New \(spec.singular.lowercased())" : nil,
                        action: { creating = true }
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: store.hasLoaded ? .center : .top)
        } else {
            List {
                if !spec.totals.isEmpty, store.search.isEmpty {
                    LedgerTotals(items: spec.totals.map { total in
                        let count = total.statuses == nil ? store.rows.count : store.rows.filter { total.statuses!.contains($0[spec.row.status ?? "status"]?.stringValue ?? "") }.count
                        return .init(
                            label: total.label,
                            value: Money.short(store.sum(total), currency: env.session.currency),
                            detail: "\(count) \(count == 1 ? spec.singular.lowercased() : spec.title.lowercased())",
                            tint: total.tone.color
                        )
                    })
                    .padding(.vertical, 14)
                    .ledgerRow()
                }
                ForEach(Array(store.visibleRows.enumerated()), id: \.offset) { index, row in
                    Group {
                        if let id = row.recordID, spec.hasDetail {
                            NavigationLink(value: RecordRoute(spec: spec.key, id: id)) {
                                RecordRowView(spec: spec, row: row)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                        } else {
                            RecordRowView(spec: spec, row: row)
                        }
                    }
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .contextMenu {
                        Button {
                            env.router.askTilly("Tell me about this \(spec.singular.lowercased()): \(RecordRowView.title(spec: spec, row: row)).", page: spec.key)
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    }
                }
                if store.hasMore {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                    .frame(height: 44)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
                    .task { await store.loadMore(env.api) }
                } else {
                    LedgerEndMarker(text: "\(store.visibleRows.count) \(store.visibleRows.count == 1 ? spec.singular.lowercased() : spec.title.lowercased())")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await store.load(env.api) }
        }
    }
}

/// A ledger line for any record.
struct RecordRowView: View {
    let spec: RecordSpec
    let row: JSONValue

    @Environment(AppEnvironment.self) private var env

    static func title(spec: RecordSpec, row: JSONValue) -> String {
        for path in spec.row.title {
            if let value = row[path], let text = RecordFormat.text(value, key: path, record: row, spec: spec, currency: ""), !text.isEmpty {
                return text
            }
        }
        return spec.singular
    }

    private var subtitle: String {
        var parts = spec.row.subtitle.compactMap { path in
            row[path].flatMap { RecordFormat.text($0, key: path, record: row, spec: spec, currency: env.session.currency) }
        }
        if let path = spec.row.date, let value = row[path]?.stringValue, !value.isEmpty {
            parts.append(DubblDate.short(value))
        }
        return parts.joined(separator: " · ")
    }

    private var status: String? {
        spec.row.status.flatMap { row[$0]?.stringValue }.flatMap { $0.isEmpty ? nil : $0 }
    }

    var body: some View {
        let title = Self.title(spec: spec, row: row)
        HStack(alignment: spec.row.avatar ? .center : .firstTextBaseline, spacing: 12) {
            if spec.row.avatar {
                Avatar(name: title, size: 36)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                if spec.row.number != nil || !subtitle.isEmpty {
                    HStack(spacing: 6) {
                        if let path = spec.row.number, let number = row[path]?.stringValue, !number.isEmpty {
                            Text(number)
                                .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                if let path = spec.row.amount, let amount = row[path]?.intValue {
                    let currency = spec.row.currency.flatMap { row[$0]?.stringValue } ?? env.session.currency
                    Text(Money.format(amount, currency: currency))
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                        .fixedSize()
                }
                if let status {
                    LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: spec))
                }
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
