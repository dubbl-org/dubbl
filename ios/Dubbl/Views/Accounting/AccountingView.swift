import SwiftUI

struct AccountingView: View {
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selectedTab) {
                Text("Accounts").tag(0)
                Text("Journal").tag(1)
            }
            .pickerStyle(.segmented)
            .padding()

            if selectedTab == 0 {
                ChartOfAccountsView()
            } else {
                JournalEntryListView()
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Accounting")
    }
}

// MARK: - Chart of Accounts

struct ChartOfAccountsView: View {
    @StateObject private var viewModel: ListViewModel<ChartAccount>
    @State private var selectedType: String?

    init() {
        let service = AccountingService()
        _viewModel = StateObject(wrappedValue: ListViewModel<ChartAccount> { page, limit, filter, _ in
            try await service.listAccounts(page: page, limit: limit, type: filter)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            FilterChips(options: [
                ("All", nil),
                ("Asset", "asset"),
                ("Liability", "liability"),
                ("Equity", "equity"),
                ("Revenue", "revenue"),
                ("Expense", "expense"),
            ], selected: $selectedType)
            .onChange(of: selectedType) { newValue in
                Task { await viewModel.filter(newValue) }
            }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(icon: "list.number", title: "No Accounts", message: "Your chart of accounts will appear here.")
            } else {
                List {
                    ForEach(viewModel.items) { account in
                        HStack {
                            Image(systemName: account.type?.icon ?? "circle")
                                .foregroundColor(.dubblPrimary)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(account.name)
                                    .font(.subheadline).fontWeight(.medium)
                                HStack(spacing: 6) {
                                    Text(account.code ?? "")
                                        .font(.caption).foregroundColor(.dubblMuted)
                                    if let type = account.type {
                                        Text("·")
                                        Text(type.displayName)
                                            .font(.caption).foregroundColor(.dubblMuted)
                                    }
                                }
                            }
                            Spacer()
                            if account.isActive == false {
                                StatusBadge("Inactive", color: .gray)
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                }
                .listStyle(.plain)
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}

// MARK: - Journal Entries

struct JournalEntryListView: View {
    @StateObject private var viewModel: ListViewModel<JournalEntry>
    @State private var selectedEntry: JournalEntry?

    init() {
        let service = AccountingService()
        _viewModel = StateObject(wrappedValue: ListViewModel<JournalEntry> { page, limit, filter, _ in
            try await service.listEntries(page: page, limit: limit, status: filter)
        })
    }

    var body: some View {
        if viewModel.items.isEmpty && !viewModel.isLoading {
            EmptyStateView(icon: "doc.text", title: "No Journal Entries", message: "Journal entries will appear here.")
        } else {
            List {
                ForEach(viewModel.items) { entry in
                    Button(action: { selectedEntry = entry }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.entryNumber ?? "Entry")
                                    .font(.subheadline).fontWeight(.medium)
                                Text(entry.description ?? entry.date ?? "")
                                    .font(.caption).foregroundColor(.dubblMuted).lineLimit(1)
                            }
                            Spacer()
                            if let status = entry.status {
                                StatusBadge(status.displayName, color: status == .posted ? .dubblPrimary : .gray)
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .onAppear {
                        if entry.id == viewModel.items.last?.id {
                            Task { await viewModel.loadMore() }
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}
