import SwiftUI

struct ExpenseListView: View {
    @StateObject private var viewModel: ListViewModel<ExpenseClaim>
    @State private var selectedStatus: String?
    @State private var showCreateForm = false
    @State private var selectedExpense: ExpenseClaim?

    init() {
        let service = ExpenseService()
        _viewModel = StateObject(wrappedValue: ListViewModel<ExpenseClaim> { page, limit, filter, _ in
            try await service.list(page: page, limit: limit, status: filter)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            FilterChips(options: [
                ("All", nil), ("Draft", "draft"), ("Submitted", "submitted"),
                ("Approved", "approved"), ("Paid", "paid"),
            ], selected: $selectedStatus)
            .onChange(of: selectedStatus) { newValue in Task { await viewModel.filter(newValue) } }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "receipt", title: "No Expenses",
                    message: "Submit expense claims and track reimbursements.",
                    actionTitle: "New Expense", action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { expense in
                        Button(action: { selectedExpense = expense }) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(expense.title ?? "Expense")
                                        .font(.subheadline).fontWeight(.medium)
                                    if let status = expense.status {
                                        StatusBadge(status.displayName, color:
                                            status == .approved || status == .paid ? .dubblPrimary :
                                            status == .rejected ? .dubblDestructive : .dubblMuted)
                                    }
                                }
                                Spacer()
                                CurrencyText(expense.totalAmount, currency: expense.currencyCode,
                                           style: .subheadline, weight: .semibold)
                            }
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
        .dubblNavigationTitle("Expenses")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedExpense) { expense in
            ExpenseDetailView(expenseId: expense.id)
        }
        .sheet(isPresented: $showCreateForm) {
            ExpenseFormView { Task { await viewModel.refresh() } }
        }
        .overlay { if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() } }
    }
}

struct ExpenseDetailView: View {
    let expenseId: String
    @State private var expense: ExpenseClaim?
    @State private var isLoading = true
    @Environment(\.dismiss) private var dismiss
    private let service = ExpenseService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading { LoadingView() }
                else if let expense = expense {
                    ScrollView {
                        VStack(spacing: 20) {
                            VStack(spacing: 8) {
                                if let status = expense.status { StatusBadge(status.displayName) }
                                Text(expense.title ?? "Expense").font(.title2).fontWeight(.bold)
                                CurrencyText(expense.totalAmount, currency: expense.currencyCode, style: .title, weight: .bold)
                            }
                            .frame(maxWidth: .infinity).dubblCard()

                            if let items = expense.items, !items.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Items").font(.headline)
                                    ForEach(items) { item in
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(item.description ?? "Item").font(.subheadline)
                                                Text(item.date ?? "").font(.caption).foregroundColor(.dubblMuted)
                                                if item.isMileage == true, let miles = item.distanceMiles {
                                                    Text("\(Double(miles) / 100, specifier: "%.1f") miles")
                                                        .font(.caption).foregroundColor(.dubblInfo)
                                                }
                                            }
                                            Spacer()
                                            Text((item.amount ?? 0).asCurrency()).font(.subheadline).fontWeight(.medium)
                                        }
                                        Divider()
                                    }
                                }
                                .dubblCard()
                            }

                            // Actions
                            if expense.status == .draft {
                                Button("Submit for Approval") {
                                    Task { try? await service.submit(id: expenseId) }
                                }
                                .buttonStyle(DubblButtonStyle())
                            }
                        }
                        .padding()
                    }
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarLeading) { Button("Close") { dismiss() }.foregroundColor(.dubblPrimary) } }
            .task {
                do { expense = try await service.get(id: expenseId) } catch {}
                isLoading = false
            }
        }
    }
}

struct ExpenseFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var items: [ExpenseLineForm] = [ExpenseLineForm()]
    @State private var isSubmitting = false
    @State private var error: String?
    private let service = ExpenseService()
    var onComplete: (() -> Void)?

    struct ExpenseLineForm: Identifiable {
        let id = UUID()
        var description = ""
        var amount = ""
        var date = Date()
        var category = ""
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Expense Claim") {
                    TextField("Title", text: $title)
                    TextField("Description (optional)", text: $description)
                }
                Section("Items") {
                    ForEach($items) { $item in
                        VStack(spacing: 8) {
                            TextField("Description", text: $item.description)
                            HStack {
                                TextField("Amount", text: $item.amount).keyboardType(.decimalPad)
                                TextField("Category", text: $item.category)
                            }
                        }
                    }
                    .onDelete { items.remove(atOffsets: $0) }
                    Button(action: { items.append(ExpenseLineForm()) }) {
                        Label("Add Item", systemImage: "plus").foregroundColor(.dubblPrimary)
                    }
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary) }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(title.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let expenseItems = items.compactMap { item -> ExpenseItemCreate? in
            guard !item.description.isEmpty else { return nil }
            return ExpenseItemCreate(
                date: dateFormatter.string(from: item.date),
                description: item.description,
                amount: Int((Double(item.amount) ?? 0) * 100),
                category: item.category.isEmpty ? nil : item.category
            )
        }
        do {
            _ = try await service.create(ExpenseClaimCreate(
                title: title, description: description.isEmpty ? nil : description, items: expenseItems
            ))
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
