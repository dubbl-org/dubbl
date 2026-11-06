import SwiftUI

/// Every call, email, meeting, note and task across deals, newest first.
/// Chips narrow to overdue, upcoming, logged or done; swipe to tick one off.
struct CRMActivitiesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var filter = "all"
    @State private var activities: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var logging = false
    @State private var shown = false

    private static let filters: [(value: String, label: String)] = [
        ("all", "All"), ("overdue", "Overdue"), ("upcoming", "Upcoming"), ("logged", "Logged"), ("done", "Done"),
    ]

    /// The same buckets as the API's `status`, worked out on the device too.
    static func bucket(_ activity: JSONValue) -> String {
        if activity["completedAt"]?.stringValue != nil { return "done" }
        guard let scheduled = DubblDate.parseMoment(activity["scheduledAt"]?.stringValue) else { return "logged" }
        return scheduled < .now ? "overdue" : "upcoming"
    }

    private var visible: [JSONValue] {
        filter == "all" ? activities : activities.filter { Self.bucket($0) == filter }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Activities")
            .navigationSubtitle(loaded ? "\(visible.count)" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Log activity", systemImage: "plus") { logging = true }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                ChipRow(options: Self.filters.map { option in
                    (value: option.value, label: option.label, count: option.value == "all" ? nil : activities.filter { Self.bucket($0) == option.value }.count)
                }, selection: $filter)
                .padding(.vertical, 8)
                .background(DTheme.canvas)
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $logging) {
                CRMLogActivitySheet { Task { await load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if !loaded {
            if let error {
                ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 9) }
            }
        } else if visible.isEmpty {
            EmptyStateView(
                symbol: "checklist",
                title: filter == "all" ? "No activities yet" : "Nothing here",
                message: filter == "overdue" ? "You're on top of every follow-up." : "Calls, emails and meetings you log on deals show up here.",
                actionTitle: filter == "all" ? "Log activity" : nil,
                action: { logging = true }
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                ForEach(Array(visible.enumerated()), id: \.element.recordID) { index, activity in
                    let done = activity["completedAt"]?.stringValue != nil
                    Group {
                        if let dealId = activity["dealId"]?.stringValue ?? activity["deal.id"]?.stringValue {
                            NavigationLink(value: RecordRoute(spec: "crm-deals", id: dealId)) {
                                CRMActivityRow(activity: activity) { setDone(activity, $0) }
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                        } else {
                            CRMActivityRow(activity: activity) { setDone(activity, $0) }
                        }
                    }
                    .ledgerRow()
                    .reveal(shown, min(index, 8))
                    .swipeActions(edge: .leading) {
                        Button { setDone(activity, !done) } label: {
                            Label(done ? "Not done" : "Done", systemImage: done ? "arrow.uturn.backward" : "checkmark")
                        }
                        .tint(done ? DTheme.inkSecondary : DTheme.positive)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { delete(activity) } label: { Label("Delete", systemImage: "trash") }
                    }
                }
                LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "activity" : "activities")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("crm/activities", query: ["limit": "100"])
            withAnimation(.snappy) {
                activities = response.opsArray("data")
                loaded = true
                error = nil
            }
            shown = true
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }

    private func setDone(_ activity: JSONValue, _ done: Bool) {
        guard let id = activity.recordID else { return }
        let stamp: JSONValue = done ? .string(Date.now.formatted(.iso8601)) : .null
        withAnimation(.snappy) {
            activities = activities.map { $0.recordID == id ? $0.opsSetting("completedAt", stamp) : $0 }
        }
        Task {
            do {
                let _: JSONValue = try await env.api.patch("crm/activities/\(id)", body: CRMCompleteBody(completed: done))
                if done { env.toast.show("Marked done") }
            } catch {
                env.toast.error(error)
                await load()
            }
        }
    }

    private func delete(_ activity: JSONValue) {
        guard let id = activity.recordID else { return }
        withAnimation(.snappy) { activities.removeAll { $0.recordID == id } }
        Task {
            do {
                let _: JSONValue = try await env.api.delete("crm/activities/\(id)")
            } catch {
                env.toast.error(error)
                await load()
            }
        }
    }
}
