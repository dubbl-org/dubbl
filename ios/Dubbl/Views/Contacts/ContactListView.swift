import SwiftUI

struct ContactListView: View {
    @StateObject private var viewModel: ListViewModel<Contact>
    @State private var selectedType: String?
    @State private var searchText = ""
    @State private var showCreateForm = false
    @State private var selectedContact: Contact?

    init() {
        let service = ContactService()
        _viewModel = StateObject(wrappedValue: ListViewModel<Contact> { page, limit, filter, search in
            try await service.list(page: page, limit: limit, type: filter, search: search)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            DubblSearchBar(text: $searchText, placeholder: "Search contacts...")
                .padding(.horizontal)
                .padding(.vertical, 8)
                .onChange(of: searchText) { newValue in
                    Task { await viewModel.search(newValue) }
                }

            FilterChips(options: [
                ("All", nil),
                ("Customers", "customer"),
                ("Suppliers", "supplier"),
            ], selected: $selectedType)
            .onChange(of: selectedType) { newValue in
                Task { await viewModel.filter(newValue) }
            }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "person.2",
                    title: "No Contacts",
                    message: "Add customers and suppliers to get started.",
                    actionTitle: "Add Contact",
                    action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { contact in
                        Button(action: { selectedContact = contact }) {
                            ContactRow(contact: contact)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .onAppear {
                            if contact.id == viewModel.items.last?.id {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Contacts")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedContact) { contact in
            ContactDetailView(contactId: contact.id)
        }
        .sheet(isPresented: $showCreateForm) {
            ContactFormView { Task { await viewModel.refresh() } }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}

struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.dubblPrimary.opacity(0.15))
                    .frame(width: 40, height: 40)
                Text(String(contact.name.prefix(1)).uppercased())
                    .font(.headline)
                    .foregroundColor(.dubblPrimary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(contact.name)
                    .font(.subheadline).fontWeight(.medium)
                if let email = contact.email {
                    Text(email).font(.caption).foregroundColor(.dubblMuted)
                }
            }
            Spacer()
            if let type = contact.type {
                StatusBadge(type.displayName, color: type == .customer ? .dubblPrimary : .dubblInfo)
            }
        }
        .dubblCard()
    }
}
