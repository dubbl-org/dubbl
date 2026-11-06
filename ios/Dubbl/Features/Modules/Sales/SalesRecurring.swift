import SwiftUI

// Recurring templates (`/recurring`): one route serves invoices, bills and
// expenses by `type`. The list is its own screen so each page shows only its
// type, sorted by the next run, with pause and resume on a swipe. The detail is
// the generic one (spec "recurring-templates").

enum SalesRecurring {
    static let frequencies: [(value: String, label: String)] = [
        ("weekly", "Weekly"), ("fortnightly", "Every 2 weeks"), ("monthly", "Monthly"),
        ("quarterly", "Quarterly"), ("semi_annual", "Every 6 months"), ("annual", "Yearly"),
    ]

    static func frequencyLabel(_ value: String?) -> String {
        frequencies.first { $0.value == value }?.label ?? (value ?? "").replacingOccurrences(of: "_", with: " ").humanized
    }

    /// The create form for one type of template.
    static func kind(_ type: String) -> SalesDocumentKind {
        let noun = type == "invoice" ? "invoice" : type == "bill" ? "bill" : "expense"
        return SalesDocumentKind(
            title: "New recurring \(noun)",
            singular: "Recurring \(noun)",
            party: type == "invoice" ? .customer : .supplier,
            endpoint: "recurring",
            responseKey: "template",
            numberKey: "name",
            dateLabel: "Starts",
            dateKey: "startDate",
            secondDate: .init(label: "Ends", key: "endDate", days: 365, optional: true),
            sendsCurrency: false,
            referencePlaceholder: "Copied onto every \(noun)",
            notesPlaceholder: "Copied onto every \(noun)",
            asksName: true,
            asksFrequency: true,
            fixed: ["type": .string(type)],
            specKey: "recurring-templates"
        )
    }
}

/// Templates of one type: what repeats, for whom, how often and when it runs next.
struct SalesRecurringListView: View {
    /// "invoice", "bill" or "expense".
    let type: String
    let title: String

    @Environment(AppEnvironment.self) private var env
    @State private var rows: [JSONValue] = []
    @State private var loaded = false
    @State private var failed: String?
    @State private var filter = "all"
    @State private var search = ""
    @State private var creating = false
    @State private var shown = false

    private var noun: String { type == "invoice" ? "invoice" : type == "bill" ? "bill" : "expense" }

    private var visible: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { row in
            (filter == "all" || row["status"]?.stringValue == filter)
                && (term.isEmpty || [row["name"]?.stringValue, row["contact.name"]?.stringValue].compactMap { $0 }.contains { $0.localizedCaseInsensitiveContains(term) })
        }
    }

    private func count(_ status: String) -> Int { rows.filter { $0["status"]?.stringValue == status }.count }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle(title)
            .navigationSubtitle(loaded ? "\(visible.count)" : "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search \(title.lowercased())")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Status", selection: $filter) {
                            Text("All").tag("all")
                            Text("Active").tag("active")
                            Text("Paused").tag("paused")
                            Text("Completed").tag("completed")
                        }
                    } label: {
                        Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter by status")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New recurring \(noun)", systemImage: "plus") { creating = true }
                }
            }
            .task {
                await load()
                shown = true
            }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == "recurring-templates" { Task { await load() } }
            }
            .sheet(isPresented: $creating) {
                SalesDocumentSheet(kind: SalesRecurring.kind(type))
            }
    }

    @ViewBuilder
    private var content: some View {
        if rows.isEmpty {
            Group {
                if let failed {
                    ErrorStateView(message: failed) { await load() }
                } else if loaded {
                    EmptyStateView(
                        symbol: "repeat",
                        title: "No recurring \(noun)s yet",
                        message: "Set one up and dubbl creates the \(noun) for you on schedule.",
                        actionTitle: "New recurring \(noun)",
                        action: { creating = true }
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 7) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                if search.isEmpty {
                    LedgerTotals(items: [
                        .init(label: "Active", value: "\(count("active"))", detail: "running", tint: DTheme.positive) { filter = filter == "active" ? "all" : "active" },
                        .init(label: "Paused", value: "\(count("paused"))", detail: "on hold", tint: DTheme.warning) { filter = filter == "paused" ? "all" : "paused" },
                        .init(label: "Next run", value: nextRun.map { DubblDate.short($0) }, detail: nextRunName),
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()
                }
                ForEach(Array(visible.enumerated()), id: \.offset) { index, row in
                    Group {
                        if let id = row.recordID {
                            NavigationLink(value: RecordRoute(spec: "recurring-templates", id: id)) {
                                SalesRecurringRow(row: row)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                        } else {
                            SalesRecurringRow(row: row)
                        }
                    }
                    .ledgerRow()
                    .reveal(shown, min(index, 8))
                    .swipeActions(edge: .trailing) {
                        if let status = row["status"]?.stringValue, status != "completed" {
                            Button(status == "active" ? "Pause" : "Resume", systemImage: status == "active" ? "pause" : "play") {
                                Task { await toggle(row) }
                            }
                            .tint(status == "active" ? DTheme.warning : DTheme.positive)
                        }
                    }
                    .contextMenu {
                        if let status = row["status"]?.stringValue, status != "completed" {
                            Button(status == "active" ? "Pause" : "Resume", systemImage: status == "active" ? "pause" : "play") {
                                Task { await toggle(row) }
                            }
                        }
                        Button("Ask Tilly", systemImage: "sparkle") {
                            env.router.askTilly("Tell me about my recurring \(noun) \"\(row["name"]?.stringValue ?? "")\".", page: "recurring")
                        }
                    }
                }
                LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "template" : "templates")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await load() }
        }
    }

    private var nextActive: JSONValue? {
        rows.filter { $0["status"]?.stringValue == "active" }
            .min { ($0["nextRunDate"]?.stringValue ?? "9") < ($1["nextRunDate"]?.stringValue ?? "9") }
    }

    private var nextRun: String? { nextActive?["nextRunDate"]?.stringValue }
    private var nextRunName: String? { nextActive?["name"]?.stringValue }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("recurring", query: [
                "type": type, "limit": "100", "sortBy": "nextRun", "sortOrder": "asc",
            ])
            let all = RecordListStore.rows(in: response, key: nil)
            withAnimation(.snappy) {
                // The route filters by type; demo fixtures don't, so match here too.
                rows = all.filter { $0["type"]?.stringValue == type }
                failed = nil
                loaded = true
            }
        } catch {
            guard !(error is CancellationError) else { return }
            failed = error.localizedDescription
            loaded = true
        }
    }

    /// `POST recurring/{id}/pause` flips active and paused.
    private func toggle(_ row: JSONValue) async {
        guard let id = row.recordID else { return }
        let pausing = row["status"]?.stringValue == "active"
        do {
            let _: JSONValue = try await env.api.post("recurring/\(id)/pause", body: [String: JSONValue]())
            env.toast.show(pausing ? "Paused" : "Resumed", symbol: pausing ? "pause.fill" : "play.fill")
            #if DEBUG
            if DemoData.isEnabled {
                // Fixtures don't change, so flip the row here.
                if let index = rows.firstIndex(where: { $0.recordID == id }), case var .object(object) = rows[index] {
                    object["status"] = .string(pausing ? "paused" : "active")
                    withAnimation(.snappy) { rows[index] = .object(object) }
                }
                return
            }
            #endif
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}

/// Name, who and how often; the next run and status on the right.
struct SalesRecurringRow: View {
    let row: JSONValue

    private var status: String { row["status"]?.stringValue ?? "active" }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(row["name"]?.stringValue ?? "Template")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([row["contact.name"]?.stringValue, SalesRecurring.frequencyLabel(row["frequency"]?.stringValue)].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(status == "active" ? "Next \(DubblDate.short(row["nextRunDate"]?.stringValue))" : status == "completed" ? "\(row["occurrencesGenerated"]?.intValue ?? 0) made" : "On hold")
                    .font(.system(size: 14, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(status == "active" ? DTheme.ink : DTheme.inkSecondary)
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
