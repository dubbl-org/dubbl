import SwiftUI

struct BankingView: View {
    @StateObject private var viewModel: ListViewModel<BankAccount>
    @State private var selectedAccount: BankAccount?
    @State private var showCreateForm = false

    init() {
        let service = BankService()
        _viewModel = StateObject(wrappedValue: ListViewModel<BankAccount> { page, limit, _, _ in
            try await service.listAccounts(page: page, limit: limit)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "building.columns",
                    title: "No Bank Accounts",
                    message: "Add your bank accounts to track balances and transactions.",
                    actionTitle: "Add Account",
                    action: { showCreateForm = true }
                )
            } else {
                // Total Balance Card
                if !viewModel.items.isEmpty {
                    let totalBalance = viewModel.items.compactMap(\.balance).reduce(0, +)
                    VStack(spacing: 4) {
                        Text("Total Balance")
                            .font(.caption).foregroundColor(.dubblMuted)
                        Text(totalBalance.asCurrency())
                            .font(.system(size: 28, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                    .background(
                        LinearGradient(
                            colors: [.dubblPrimary, .dubblPrimaryDark],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .foregroundColor(.white)
                }

                List {
                    ForEach(viewModel.items) { account in
                        Button(action: { selectedAccount = account }) {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle()
                                        .fill(Color.dubblPrimary.opacity(0.15))
                                        .frame(width: 44, height: 44)
                                    Image(systemName: account.accountType?.icon ?? "building.columns")
                                        .foregroundColor(.dubblPrimary)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(account.accountName)
                                        .font(.subheadline).fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    Text(account.accountType?.displayName ?? "Account")
                                        .font(.caption).foregroundColor(.dubblMuted)
                                }
                                Spacer()
                                Text((account.balance ?? 0).asCurrency(code: account.currencyCode ?? "USD"))
                                    .font(.subheadline).fontWeight(.semibold)
                                    .foregroundColor(.primary)
                            }
                            .dubblCard()
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Banking")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedAccount) { account in
            BankTransactionListView(account: account)
        }
        .sheet(isPresented: $showCreateForm) {
            BankAccountFormView { Task { await viewModel.refresh() } }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}

// MARK: - Transaction List

struct BankTransactionListView: View {
    let account: BankAccount
    @StateObject private var viewModel: ListViewModel<BankTransaction>
    @Environment(\.dismiss) private var dismiss

    init(account: BankAccount) {
        self.account = account
        let service = BankService()
        let accountId = account.id
        _viewModel = StateObject(wrappedValue: ListViewModel<BankTransaction> { page, limit, filter, _ in
            try await service.listTransactions(accountId: accountId, page: page, limit: limit, status: filter)
        })
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Account Header
                VStack(spacing: 4) {
                    Text(account.accountName)
                        .font(.headline).foregroundColor(.white)
                    Text((account.balance ?? 0).asCurrency(code: account.currencyCode ?? "USD"))
                        .font(.system(size: 24, weight: .bold)).foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Color.dubblPrimary)

                if viewModel.items.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        icon: "list.bullet",
                        title: "No Transactions",
                        message: "Transactions will appear here after importing bank statements."
                    )
                } else {
                    List {
                        ForEach(viewModel.items) { txn in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(txn.description ?? "Transaction")
                                        .font(.subheadline).lineLimit(1)
                                    Text(txn.date ?? "")
                                        .font(.caption).foregroundColor(.dubblMuted)
                                }
                                Spacer()
                                let amount = txn.amount ?? 0
                                Text(amount.asCurrency())
                                    .font(.subheadline).fontWeight(.medium)
                                    .foregroundColor(amount >= 0 ? .dubblPrimary : .dubblDestructive)
                            }
                            .onAppear {
                                if txn.id == viewModel.items.last?.id {
                                    Task { await viewModel.loadMore() }
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }.foregroundColor(.dubblPrimary)
                }
            }
            .refreshable { await viewModel.refresh() }
            .task { await viewModel.load() }
        }
    }
}

// MARK: - Create Account Form

struct BankAccountFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var accountName = ""
    @State private var bankName = ""
    @State private var accountNumber = ""
    @State private var accountType = "checking"
    @State private var isSubmitting = false
    @State private var error: String?

    private let service = BankService()
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationView {
            Form {
                Section("Account Details") {
                    TextField("Account Name", text: $accountName)
                    TextField("Bank Name", text: $bankName)
                    TextField("Account Number", text: $accountNumber)
                        .keyboardType(.numberPad)
                }
                Section("Type") {
                    Picker("Account Type", selection: $accountType) {
                        ForEach(BankAccountType.allCases, id: \.rawValue) { type in
                            Text(type.displayName).tag(type.rawValue)
                        }
                    }
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Bank Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(accountName.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        do {
            _ = try await service.createAccount(BankAccountCreate(
                accountName: accountName,
                accountNumber: accountNumber.isEmpty ? nil : accountNumber,
                bankName: bankName.isEmpty ? nil : bankName,
                accountType: accountType
            ))
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
