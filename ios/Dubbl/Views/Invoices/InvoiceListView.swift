import SwiftUI

struct InvoiceListView: View {
    @StateObject private var viewModel: ListViewModel<Invoice>
    @State private var selectedStatus: String?
    @State private var searchText = ""
    @State private var showCreateForm = false
    @State private var selectedInvoice: Invoice?

    private let invoiceService = InvoiceService()

    init() {
        let service = InvoiceService()
        _viewModel = StateObject(wrappedValue: ListViewModel<Invoice> { page, limit, filter, search in
            try await service.list(page: page, limit: limit, status: filter, search: search)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            DubblSearchBar(text: $searchText, placeholder: "Search invoices...")
                .padding(.horizontal)
                .padding(.vertical, 8)
                .onChange(of: searchText) { newValue in
                    Task { await viewModel.search(newValue) }
                }

            FilterChips(options: [
                ("All", nil),
                ("Draft", "draft"),
                ("Sent", "sent"),
                ("Paid", "paid"),
                ("Overdue", "overdue"),
            ], selected: $selectedStatus)
            .onChange(of: selectedStatus) { newValue in
                Task { await viewModel.filter(newValue) }
            }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "doc.text",
                    title: "No Invoices",
                    message: "Create your first invoice to start tracking revenue.",
                    actionTitle: "Create Invoice",
                    action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { invoice in
                        Button(action: { selectedInvoice = invoice }) {
                            InvoiceRow(invoice: invoice)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .onAppear {
                            if invoice.id == viewModel.items.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }

                    if viewModel.isLoadingMore {
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Invoices")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus")
                        .foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedInvoice) { invoice in
            InvoiceDetailView(invoiceId: invoice.id)
        }
        .sheet(isPresented: $showCreateForm) {
            InvoiceFormView {
                Task { await viewModel.refresh() }
            }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty {
                LoadingView()
            }
        }
    }
}
