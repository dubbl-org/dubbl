import SwiftUI

struct InventoryView: View {
    @StateObject private var viewModel: ListViewModel<InventoryItem>
    @State private var searchText = ""
    @State private var showCreateForm = false
    @State private var selectedItem: InventoryItem?

    init() {
        let service = InventoryService()
        _viewModel = StateObject(wrappedValue: ListViewModel<InventoryItem> { page, limit, _, search in
            try await service.listItems(page: page, limit: limit, search: search)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            DubblSearchBar(text: $searchText, placeholder: "Search products...")
                .padding(.horizontal)
                .padding(.vertical, 8)
                .onChange(of: searchText) { newValue in
                    Task { await viewModel.search(newValue) }
                }

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "cube.box",
                    title: "No Inventory Items",
                    message: "Add products and track your inventory.",
                    actionTitle: "Add Item",
                    action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { item in
                        Button(action: { selectedItem = item }) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color.dubblPrimary.opacity(0.1))
                                        .frame(width: 44, height: 44)
                                    Image(systemName: "cube.box")
                                        .foregroundColor(.dubblPrimary)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .font(.subheadline).fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    HStack(spacing: 8) {
                                        if let sku = item.sku {
                                            Text("SKU: \(sku)")
                                                .font(.caption).foregroundColor(.dubblMuted)
                                        }
                                        if let qty = item.quantityOnHand {
                                            Text("Qty: \(qty)")
                                                .font(.caption).foregroundColor(.dubblMuted)
                                        }
                                    }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    if let price = item.salePrice {
                                        Text(price.asCurrency())
                                            .font(.subheadline).fontWeight(.medium)
                                            .foregroundColor(.primary)
                                    }
                                    if let reorderPoint = item.reorderPoint,
                                       let qty = item.quantityOnHand,
                                       qty <= reorderPoint {
                                        StatusBadge("Low Stock", color: .dubblWarning)
                                    }
                                }
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
        .dubblNavigationTitle("Inventory")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedItem) { item in
            InventoryDetailView(itemId: item.id)
        }
        .sheet(isPresented: $showCreateForm) {
            InventoryFormView { Task { await viewModel.refresh() } }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}

// MARK: - Detail

struct InventoryDetailView: View {
    let itemId: String
    @State private var item: InventoryItem?
    @State private var isLoading = true
    @Environment(\.dismiss) private var dismiss
    private let service = InventoryService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    LoadingView()
                } else if let item = item {
                    ScrollView {
                        VStack(spacing: 20) {
                            VStack(spacing: 8) {
                                Image(systemName: "cube.box")
                                    .font(.system(size: 36)).foregroundColor(.dubblPrimary)
                                Text(item.name).font(.title2).fontWeight(.bold)
                                if let code = item.code { Text(code).font(.caption).foregroundColor(.dubblMuted) }
                            }
                            .frame(maxWidth: .infinity).dubblCard()

                            VStack(spacing: 12) {
                                if let sku = item.sku { DetailRow(label: "SKU", value: sku) }
                                if let qty = item.quantityOnHand { DetailRow(label: "Quantity on Hand", value: "\(qty)") }
                                if let reorder = item.reorderPoint { DetailRow(label: "Reorder Point", value: "\(reorder)") }
                                if let purchase = item.purchasePrice { DetailRow(label: "Purchase Price", value: purchase.asCurrency()) }
                                if let sale = item.salePrice { DetailRow(label: "Sale Price", value: sale.asCurrency()) }
                                if let tracking = item.trackingMethod { DetailRow(label: "Tracking", value: tracking.capitalized) }
                            }
                            .dubblCard()

                            if let desc = item.description, !desc.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Description").font(.headline)
                                    Text(desc).font(.subheadline).foregroundColor(.dubblMuted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).dubblCard()
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
                do { item = try await service.getItem(id: itemId) } catch {}
                isLoading = false
            }
        }
    }
}

// MARK: - Form

struct InventoryFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var name = ""
    @State private var sku = ""
    @State private var salePrice = ""
    @State private var purchasePrice = ""
    @State private var description = ""
    @State private var isSubmitting = false
    @State private var error: String?
    private let service = InventoryService()
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationView {
            Form {
                Section("Product Info") {
                    TextField("Code", text: $code)
                    TextField("Name", text: $name)
                    TextField("SKU (optional)", text: $sku)
                }
                Section("Pricing") {
                    TextField("Sale Price", text: $salePrice).keyboardType(.decimalPad)
                    TextField("Purchase Price", text: $purchasePrice).keyboardType(.decimalPad)
                }
                Section("Description") {
                    TextEditor(text: $description).frame(minHeight: 60)
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Product")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary) }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(code.isEmpty || name.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        do {
            _ = try await service.createItem(InventoryItemCreate(
                code: code, name: name,
                sku: sku.isEmpty ? nil : sku,
                purchasePrice: Int((Double(purchasePrice) ?? 0) * 100),
                salePrice: Int((Double(salePrice) ?? 0) * 100)
            ))
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
