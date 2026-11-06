import SwiftUI

/// The inbox: paged notifications with optimistic read, unread and delete.
@MainActor @Observable
final class NotificationsStore {
    private(set) var items: [AppNotification] = []
    private(set) var unreadCount = 0
    private(set) var hasMore = false
    private(set) var isLoadingMore = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?

    private var page = 1
    private var generation = 0
    private static let pageSize = 30

    /// Today, this week, earlier; empty groups are left out.
    var sections: [(title: String, items: [AppNotification])] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        var buckets: [[AppNotification]] = [[], [], []]
        for item in items {
            let date = DubblDate.parseMoment(item.createdAt) ?? .distantPast
            let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: today).day ?? 0
            buckets[days <= 0 ? 0 : days < 7 ? 1 : 2].append(item)
        }
        return zip(["Today", "This week", "Earlier"], buckets)
            .filter { !$0.1.isEmpty }
            .map { ($0.0, $0.1) }
    }

    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        do {
            let result: NotificationsPage = try await api.get(
                "notifications", query: ["page": "1", "limit": "\(Self.pageSize)"]
            )
            guard current == generation else { return }
            withAnimation(.snappy) {
                items = result.data
                unreadCount = result.unreadCount
                hasMore = Self.hasMore(result.pagination)
                page = 1
                errorMessage = nil
                hasLoaded = true
            }
        } catch {
            guard current == generation, !Task.isCancelled else { return }
            withAnimation(.snappy) {
                if items.isEmpty { errorMessage = error.localizedDescription }
                hasLoaded = true
            }
        }
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        let current = generation
        defer { isLoadingMore = false }
        guard let result: NotificationsPage = try? await api.get(
            "notifications", query: ["page": "\(page + 1)", "limit": "\(Self.pageSize)"]
        ), current == generation else { return }
        let known = Set(items.map(\.id))
        withAnimation(.snappy) {
            items += result.data.filter { !known.contains($0.id) }
            unreadCount = result.unreadCount
            hasMore = Self.hasMore(result.pagination)
            page += 1
        }
    }

    private static func hasMore(_ pagination: Pagination?) -> Bool {
        guard let pagination else { return false }
        return pagination.page < pagination.totalPages
    }

    /// POST notifications/{id}/read, or DELETE it to mark unread again.
    func setRead(_ notification: AppNotification, read: Bool, api: APIClient) async throws {
        guard notification.isUnread == read, let index = items.firstIndex(where: { $0.id == notification.id }) else { return }
        let previous = items[index]
        withAnimation(.snappy) {
            items[index].readAt = read ? ISO8601DateFormatter().string(from: .now) : nil
            unreadCount = max(0, unreadCount + (read ? -1 : 1))
        }
        do {
            let path = "notifications/\(notification.id)/read"
            let _: EmptyBody = read ? try await api.post(path) : try await api.delete(path)
        } catch {
            withAnimation(.snappy) {
                if let index = items.firstIndex(where: { $0.id == previous.id }) { items[index] = previous }
                unreadCount = max(0, unreadCount + (read ? 1 : -1))
            }
            throw error
        }
    }

    func delete(_ notification: AppNotification, api: APIClient) async throws {
        guard let index = items.firstIndex(where: { $0.id == notification.id }) else { return }
        withAnimation(.snappy) {
            items.remove(at: index)
            if notification.isUnread { unreadCount = max(0, unreadCount - 1) }
        }
        do {
            let _: EmptyBody = try await api.delete("notifications/\(notification.id)")
        } catch {
            withAnimation(.snappy) {
                items.insert(notification, at: min(index, items.count))
                if notification.isUnread { unreadCount += 1 }
            }
            throw error
        }
    }

    func markAllRead(_ api: APIClient) async throws {
        let previous = (items, unreadCount)
        let stamp = ISO8601DateFormatter().string(from: .now)
        withAnimation(.snappy) {
            for index in items.indices where items[index].readAt == nil { items[index].readAt = stamp }
            unreadCount = 0
        }
        do {
            let _: EmptyBody = try await api.post("notifications/read-all")
        } catch {
            withAnimation(.snappy) { (items, unreadCount) = previous }
            throw error
        }
    }
}

/// Where tapping a notification goes, from the record it points at.
enum NotificationsTarget: Hashable, Identifiable {
    case invoice(String)
    case bill(String)
    case expense(String)
    case bankAccount(String)

    var id: Self { self }

    init?(_ notification: AppNotification) {
        guard let entityId = notification.entityId, !entityId.isEmpty else { return nil }
        switch notification.entityType {
        case "invoice": self = .invoice(entityId)
        case "bill": self = .bill(entityId)
        case "expense", "expense_claim": self = .expense(entityId)
        case "bank_account": self = .bankAccount(entityId)
        default: return nil
        }
    }
}

/// Pushed from the overview bell.
struct NotificationsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var store = NotificationsStore()
    @State private var target: NotificationsTarget?
    @State private var markedAll = 0

    var body: some View {
        List {
            content
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(18)
        .scrollContentBackground(.hidden)
        .background(DTheme.shell)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Mark all read") {
                    Task { await markAllRead() }
                }
                .disabled(store.unreadCount == 0)
            }
        }
        .navigationDestination(item: $target) { target in
            switch target {
            case let .invoice(id): InvoiceDetailView(id: id)
            case let .bill(id): BillDetailView(id: id)
            case let .expense(id): ExpenseDetailView(id: id)
            case let .bankAccount(id): HomeBankAccountView(id: id)
            }
        }
        .refreshable { await store.load(env.api) }
        .task {
            guard !store.hasLoaded else { return }
            await store.load(env.api)
        }
        .sensoryFeedback(.success, trigger: markedAll)
    }

    @ViewBuilder
    private var content: some View {
        if !store.hasLoaded {
            Section {
                SkeletonRows(rows: 6, avatar: true)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(DTheme.card)
            }
        } else if let message = store.errorMessage {
            Section {
                ErrorStateView(message: message) { await store.load(env.api) }
                    .listRowBackground(Color.clear)
            }
        } else if store.items.isEmpty {
            Section {
                EmptyStateView(
                    symbol: "bell",
                    title: "You're all caught up",
                    message: "Overdue invoices, payments and approvals show up here."
                )
                .padding(.top, 60)
                .listRowBackground(Color.clear)
            }
        } else {
            ForEach(store.sections, id: \.title) { section in
                Section {
                    ForEach(section.items) { item in
                        row(item)
                    }
                } header: {
                    Text(section.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                        .textCase(nil)
                }
            }

            if store.hasMore {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowBackground(Color.clear)
                .task { await store.loadMore(env.api) }
            }
        }
    }

    private func row(_ item: AppNotification) -> some View {
        Button {
            open(item)
        } label: {
            NotificationRow(notification: item, navigates: NotificationsTarget(item) != nil)
        }
        .buttonStyle(.plain)
        .listRowBackground(DTheme.card)
        .listRowSeparatorTint(DTheme.hairline)
        .alignmentGuide(.listRowSeparatorLeading) { _ in 46 }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                Task { await setRead(item, read: item.isUnread) }
            } label: {
                Label(item.isUnread ? "Read" : "Unread", systemImage: item.isUnread ? "envelope.open" : "envelope.badge")
            }
            .tint(DTheme.info)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await delete(item) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button {
                Task { await setRead(item, read: item.isUnread) }
            } label: {
                Label(item.isUnread ? "Mark as read" : "Mark as unread", systemImage: item.isUnread ? "envelope.open" : "envelope.badge")
            }
            Button(role: .destructive) {
                Task { await delete(item) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: Actions

    private func open(_ item: AppNotification) {
        if item.isUnread {
            Task { await setRead(item, read: true) }
        }
        if let destination = NotificationsTarget(item) { target = destination }
    }

    private func setRead(_ item: AppNotification, read: Bool) async {
        do { try await store.setRead(item, read: read, api: env.api) } catch { env.toast.error(error) }
    }

    private func delete(_ item: AppNotification) async {
        do { try await store.delete(item, api: env.api) } catch { env.toast.error(error) }
    }

    private func markAllRead() async {
        do {
            try await store.markAllRead(env.api)
            markedAll += 1
        } catch {
            env.toast.error(error)
        }
    }
}

// MARK: - Row

private struct NotificationRow: View {
    let notification: AppNotification
    let navigates: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconTile(symbol: style.symbol, tone: style.tone, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(notification.title)
                        .font(.system(size: 15, weight: notification.isUnread ? .semibold : .regular))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(2)
                    Spacer(minLength: 4)
                    Text(Self.shortTime(notification.createdAt))
                        .font(.system(size: 12.5).monospacedDigit())
                        .foregroundStyle(notification.isUnread ? DTheme.inkSecondary : DTheme.inkTertiary)
                        .fixedSize()
                }
                if let body = notification.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 4)
        .overlay(alignment: .topLeading) {
            if notification.isUnread {
                Circle()
                    .fill(DTheme.info)
                    .frame(width: 7, height: 7)
                    .offset(x: -12, y: 14)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(notification.isUnread ? "Unread" : "")
        .accessibilityAddTraits(navigates ? .isLink : .isButton)
    }

    private var style: (symbol: String, tone: Tone) {
        switch notification.type {
        case "invoice_overdue": ("doc.text", .negative)
        case "payment_received": ("arrow.down.left", .positive)
        case "approval_needed": ("checkmark.seal", .info)
        case "task_assigned": ("checklist", .neutral)
        case "low_bank_balance": ("building.columns", .warning)
        case "budget_exceeded": ("gauge.with.dots.needle.67percent", .warning)
        case "payroll_due": ("calendar", .neutral)
        case "inventory_low": ("shippingbox", .warning)
        case "stripe_payment_failed": ("creditcard", .negative)
        case "webhook_exhausted": ("arrow.triangle.2.circlepath", .negative)
        case "system_alert": ("info", .neutral)
        default: ("bell", .neutral)
        }
    }

    /// "now", "12m", "3h" today; then a clock time, a weekday, or a date.
    static func shortTime(_ value: String) -> String {
        guard let date = DubblDate.parseMoment(value) else { return "" }
        let minutes = Int(Date.now.timeIntervalSince(date) / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "\(minutes / 60)h" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: .now)).day ?? 0
        if days < 7 { return date.formatted(.dateTime.weekday(.abbreviated)) }
        let sameYear = calendar.isDate(date, equalTo: .now, toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.day().month(.abbreviated))
            : date.formatted(.dateTime.day().month(.abbreviated).year())
    }
}
