import SwiftUI

struct BillListView: View {
    @StateObject private var viewModel: ListViewModel<Bill>
    @State private var selectedStatus: String?
    @State private var searchText = ""
    @State private var showCreateForm = false
    @State private var selectedBill: Bill?

    init() {
        let service = BillService()
        _viewModel = StateObject(wrappedValue: ListViewModel<Bill> { page, limit, filter, search in
            try await service.list(page: page, limit: limit, status: filter, search: search)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            DubblSearchBar(text: $searchText, placeholder: "Search bills...")
                .padding(.horizontal)
                .padding(.vertical, 8)
                .onChange(of: searchText) { newValue in
                    Task { await viewModel.search(newValue) }
                }

            FilterChips(options: [
                ("All", nil),
                ("Draft", "draft"),
                ("Pending", "pending_approval"),
                ("Paid", "paid"),
                ("Overdue", "overdue"),
            ], selected: $selectedStatus)
            .onChange(of: selectedStatus) { newValue in
                Task { await viewModel.filter(newValue) }
            }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "doc.plaintext",
                    title: "No Bills",
                    message: "Bills you receive from suppliers will appear here.",
                    actionTitle: "Create Bill",
                    action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { bill in
                        Button(action: { selectedBill = bill }) {
                            BillRow(bill: bill)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .onAppear {
                            if bill.id == viewModel.items.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Bills")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedBill) { bill in
            BillDetailView(billId: bill.id)
        }
        .sheet(isPresented: $showCreateForm) {
            BillFormView { Task { await viewModel.refresh() } }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}
