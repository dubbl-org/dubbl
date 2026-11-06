import SwiftUI

enum HomeTransactionFilter: String, CaseIterable, Hashable, Sendable {
    case all, review, reconciled

    var label: String {
        switch self {
        case .all: "All"
        case .review: "To review"
        case .reconciled: "Reconciled"
        }
    }

    /// The `status` query value for bank-accounts/{id}/transactions.
    var status: String? {
        switch self {
        case .all: nil
        case .review: "unreconciled"
        case .reconciled: "reconciled"
        }
    }
}

/// One bank account's balance and paged transactions, filtered by status.
@MainActor @Observable
final class HomeBankAccountStore {
    let id: String
    private(set) var account: BankAccount?
    private(set) var transactions: [BankTransaction] = []
    private(set) var hasMore = false
    private(set) var isLoadingMore = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    var filter: HomeTransactionFilter

    private var page = 1
    private var generation = 0
    private static let pageSize = 30

    init(id: String, account: BankAccount?, filter: HomeTransactionFilter) {
        self.id = id
        self.account = account
        self.filter = filter
    }

    /// Transactions grouped by month ("2026-10"), newest first.
    var months: [(month: String, items: [BankTransaction])] {
        var order: [String] = []
        var groups: [String: [BankTransaction]] = [:]
        for transaction in transactions {
            let day = String(transaction.date.prefix(7))
            if groups[day] == nil { order.append(day) }
            groups[day, default: []].append(transaction)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }

    private func query(page: Int) -> [String: String?] {
        ["page": "\(page)", "limit": "\(Self.pageSize)", "status": filter.status]
    }

    /// The server already filters by status; filtering again keeps rows
    /// honest if a stale page arrives for another filter.
    private func matching(_ rows: [BankTransaction]) -> [BankTransaction] {
        guard let status = filter.status else { return rows }
        return rows.filter { $0.status == status }
    }

    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        errorMessage = nil

        async let accountResponse: HomeBankAccountResponse? = try? api.get("bank-accounts/\(id)")
        do {
            let result: Page<BankTransaction> = try await api.get("bank-accounts/\(id)/transactions", query: query(page: 1))
            let fresh = await accountResponse
            guard current == generation else { return }
            withAnimation(.snappy) {
                if let fresh { account = fresh.bankAccount }
                transactions = matching(result.data)
                hasMore = result.hasMore
                page = 1
                hasLoaded = true
            }
        } catch {
            _ = await accountResponse
            guard current == generation, !Task.isCancelled else { return }
            withAnimation(.snappy) {
                if !hasLoaded || transactions.isEmpty { errorMessage = error.localizedDescription }
                hasLoaded = true
            }
        }
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        let current = generation
        defer { isLoadingMore = false }
        guard let result: Page<BankTransaction> = try? await api.get(
            "bank-accounts/\(id)/transactions", query: query(page: page + 1)
        ), current == generation else { return }
        let known = Set(transactions.map(\.id))
        withAnimation(.snappy) {
            transactions += matching(result.data).filter { !known.contains($0.id) }
            hasMore = result.hasMore
            page += 1
        }
    }
}

/// Pushed from the overview's bank accounts card (and from a low balance
/// notification): the balance, then transactions by day with status chips.
struct HomeBankAccountView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var store: HomeBankAccountStore

    init(account: BankAccount, filter: HomeTransactionFilter = .all) {
        _store = State(initialValue: HomeBankAccountStore(id: account.id, account: account, filter: filter))
    }

    init(id: String) {
        _store = State(initialValue: HomeBankAccountStore(id: id, account: nil, filter: .all))
    }

    var body: some View {
        @Bindable var store = store
        List {
            Section {
                VStack(spacing: 18) {
                    hero
                    ChipRow(
                        options: HomeTransactionFilter.allCases.map { ($0, $0.label, nil) },
                        selection: $store.filter
                    )
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            .listSectionMargins(.horizontal, 0)

            content
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(16)
        .scrollContentBackground(.hidden)
        .background(DTheme.shell)
        .navigationTitle(store.account?.accountName ?? "Bank account")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load(env.api) }
        .task {
            guard !store.hasLoaded else { return }
            await store.load(env.api)
        }
        .onChange(of: store.filter) {
            Task { await store.load(env.api) }
        }
    }

    // MARK: Hero

    @ViewBuilder
    private var hero: some View {
        if let account = store.account {
            VStack(spacing: 12) {
                HomeAccountTile(account: account, size: 46)
                VStack(spacing: 5) {
                    Text(account.accountName)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                    Text(Money.format(account.balance, currency: account.currencyCode))
                        .font(DFont.figure(36, weight: .semibold))
                        .tracking(-1.1)
                        .foregroundStyle(DTheme.ink)
                        .contentTransition(.numericText(value: Double(account.balance)))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(details(account))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .padding(.horizontal, 20)
            .accessibilityElement(children: .combine)
        } else {
            VStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 13, style: .continuous).fill(DTheme.tint).frame(width: 46, height: 46)
                RoundedRectangle(cornerRadius: 4).fill(DTheme.tintStrong).frame(width: 160, height: 26)
                RoundedRectangle(cornerRadius: 4).fill(DTheme.tint).frame(width: 110, height: 10)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .skeletonShimmer()
        }
    }

    private func details(_ account: BankAccount) -> String {
        [HomeStyle.accountTypeLabel(account.accountType), account.bankName, account.maskedNumber]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    // MARK: Transactions

    @ViewBuilder
    private var content: some View {
        if !store.hasLoaded {
            Section {
                SkeletonRows(rows: 7, avatar: false)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(DTheme.card)
            }
        } else if let message = store.errorMessage {
            Section {
                ErrorStateView(message: message) { await store.load(env.api) }
                    .listRowBackground(Color.clear)
            }
        } else if store.transactions.isEmpty {
            Section {
                emptyState
                    .listRowBackground(Color.clear)
            }
        } else {
            ForEach(store.months, id: \.month) { group in
                Section {
                    ForEach(group.items) { transaction in
                        HomeTransactionRow(transaction: transaction, currency: store.account?.currencyCode ?? env.session.currency)
                            .listRowBackground(DTheme.card)
                            .listRowSeparatorTint(DTheme.hairline)
                    }
                } header: {
                    Text(monthLabel(group.month))
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

    @ViewBuilder
    private var emptyState: some View {
        switch store.filter {
        case .review:
            EmptyStateView(symbol: "checkmark", title: "Nothing to review", message: "Every transaction here is reconciled.")
        case .reconciled:
            EmptyStateView(symbol: "tray", title: "Nothing reconciled yet", message: "Reconciled transactions show up here.")
        case .all:
            EmptyStateView(symbol: "building.columns", title: "No transactions yet", message: "Import a statement or connect a feed on the web.")
        }
    }

    private func monthLabel(_ month: String) -> String {
        guard let date = DubblDate.parseDay(month + "-01") else { return month }
        return date.formatted(.dateTime.month(.wide).year())
    }
}

private struct HomeTransactionRow: View {
    let transaction: BankTransaction
    let currency: String

    private var isIn: Bool { transaction.amount > 0 }

    private var category: String {
        if let name = transaction.accountName, !name.isEmpty { return name }
        return transaction.status == "excluded" ? "Excluded" : "Uncategorized"
    }

    private var day: String {
        guard let date = DubblDate.parseDay(transaction.date) else { return transaction.date }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return DubblDate.short(transaction.date)
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.payee?.isEmpty == false ? transaction.payee! : transaction.description)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 4) {
                    if transaction.status == "reconciled" {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(DTheme.inkTertiary)
                            .accessibilityLabel("Reconciled")
                    }
                    Text(day)
                        .foregroundStyle(DTheme.inkSecondary)
                    Text("·")
                        .foregroundStyle(DTheme.inkTertiary)
                    Text(category)
                        .foregroundStyle(transaction.accountName == nil ? DTheme.inkTertiary : DTheme.inkSecondary)
                        .lineLimit(1)
                }
                .font(.system(size: 13))
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(HomeStyle.signed(transaction.amount, currency: currency))
                    .font(DFont.figure(15, weight: .medium))
                    .foregroundStyle(isIn ? DTheme.positive : DTheme.ink)
                if transaction.pending == true {
                    Text("Pending")
                        .font(.system(size: 12))
                        .foregroundStyle(DTheme.inkTertiary)
                } else if transaction.status == "unreconciled" {
                    Text("To review")
                        .font(.system(size: 12))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}
