import SwiftUI
import VisionKit

/// Items with what's on hand: search by name, code or SKU (or scan a
/// barcode), narrow to low stock, swipe to adjust a count.
struct InventoryItemsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var items: [JSONValue] = []
    @State private var summary: JSONValue?
    @State private var filter = "all"
    @State private var search = ""
    @State private var page = 1
    @State private var hasMore = false
    @State private var loaded = false
    @State private var error: String?
    @State private var shown = false
    @State private var adjusting: InventoryItemRef?
    @State private var creating = false
    @State private var scanning = false

    private static let filters: [(value: String, label: String)] = [
        ("all", "All items"), ("active", "Active"), ("low_stock", "Low stock"), ("inactive", "Inactive"),
    ]

    /// Fixtures ignore the query, so demo mode filters and searches here.
    private var visible: [JSONValue] {
        guard OperationsFormat.isDemo else { return items }
        let term = search.trimmingCharacters(in: .whitespaces)
        return items.filter { item in
            switch filter {
            case "active": if item["isActive"]?.boolValue == false { return false }
            case "inactive": if item["isActive"]?.boolValue != false { return false }
            case "low_stock": if Inventory.level(item) == nil { return false }
            default: break
            }
            guard !term.isEmpty else { return true }
            return ["name", "code", "sku"].contains { item[$0]?.stringValue?.localizedCaseInsensitiveContains(term) == true }
        }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Items")
            .navigationSubtitle(subtitle)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Name, code or SKU")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Show", selection: $filter) {
                            ForEach(Self.filters, id: \.value) { Text($0.label).tag($0.value) }
                        }
                    } label: {
                        Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter items")
                }
                if InventoryBarcodeScanner.isAvailable {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Scan barcode", systemImage: "barcode.viewfinder") { scanning = true }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New item", systemImage: "plus") { creating = true }
                }
            }
            .task { await reload() }
            .onChange(of: filter) { _, _ in Task { await reload() } }
            .task(id: search) {
                try? await Task.sleep(for: .milliseconds(300))
                if Task.isCancelled || !loaded { return }
                await load()
            }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == "inventory-items" { Task { await load() } }
            }
            .sheet(item: $adjusting) { ref in
                InventoryAdjustSheet(item: ref.item)
            }
            .sheet(isPresented: $creating) {
                InventoryNewItemSheet { Task { await load() } }
            }
            .fullScreenCover(isPresented: $scanning) {
                InventoryScanSheet { code in search = code }
            }
    }

    private var subtitle: String {
        guard loaded else { return "" }
        let count = OperationsFormat.isDemo ? visible.count : (totalCount ?? visible.count)
        return "\(count)\(filter == "low_stock" ? " low" : "")"
    }

    @State private var totalCount: Int?

    @ViewBuilder
    private var content: some View {
        if !loaded {
            if let error {
                ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 9, avatar: false) }
            }
        } else if visible.isEmpty {
            EmptyStateView(
                symbol: "shippingbox",
                title: search.isEmpty && filter == "all" ? "No items yet" : "Nothing here",
                message: search.isEmpty ? (filter == "low_stock" ? "Everything is above its reorder point." : "Add the things you buy, make and sell to track stock.") : "No items match \"\(search)\".",
                actionTitle: search.isEmpty && filter == "all" ? "New item" : nil,
                action: { creating = true }
            )
            .frame(maxHeight: .infinity)
        } else {
            List {
                if let summary, search.isEmpty {
                    LedgerTotals(items: [
                        .init(label: "Items", value: (summary["totalItems"]?.intValue ?? 0).formatted(), detail: "In the catalogue", tint: DTheme.inkTertiary),
                        .init(label: "Stock value", value: Money.short(summary["totalValue"]?.intValue ?? 0, currency: env.session.currency), detail: "At cost", tint: DTheme.info),
                        .init(label: "Low stock", value: (summary["lowStockCount"]?.intValue ?? 0).formatted(), detail: "Need reordering", tint: DTheme.warning, action: {
                            filter = filter == "low_stock" ? "all" : "low_stock"
                        }),
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()
                }
                ForEach(Array(visible.enumerated()), id: \.element.recordID) { index, item in
                    NavigationLink(value: RecordRoute(spec: "inventory-items", id: item.recordID ?? "")) {
                        row(item)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .reveal(shown, min(index, 8))
                    .swipeActions(edge: .leading) {
                        Button { adjusting = InventoryItemRef(item: item) } label: { Label("Adjust", systemImage: "plusminus") }
                            .tint(DTheme.info)
                    }
                    .contextMenu {
                        Button { adjusting = InventoryItemRef(item: item) } label: { Label("Adjust stock", systemImage: "plusminus") }
                        Button {
                            env.router.askTilly("Tell me about the stock of \(item["name"]?.stringValue ?? "this item").", page: "inventory")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    }
                }
                if hasMore, !OperationsFormat.isDemo {
                    HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
                        .frame(height: 44)
                        .listRowBackground(DTheme.canvas)
                        .listRowSeparator(.hidden)
                        .task { await loadMore() }
                } else {
                    LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "item" : "items")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await load() }
        }
    }

    private func row(_ item: JSONValue) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(item["name"]?.stringValue ?? "Item")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let code = item["code"]?.stringValue {
                        Text(code)
                            .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    let detail = [item["sku"]?.stringValue.map { "SKU \($0)" }, item["category"]?.stringValue].compactMap { $0 }
                    if !detail.isEmpty {
                        Text(detail.joined(separator: " · "))
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            InventoryQuantity(item: item)
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func query(page: Int) -> [String: String?] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return [
            "page": "\(page)", "limit": "40", "sortBy": "name", "sortOrder": "asc",
            "status": filter == "all" ? nil : filter,
            "search": term.isEmpty ? nil : term,
        ]
    }

    private func reload() async {
        shown = false
        await load()
        shown = true
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("inventory", query: query(page: 1))
            withAnimation(.snappy) {
                items = response.opsArray("data")
                summary = response["summary"]
                totalCount = response["pagination.total"]?.intValue
                hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
                page = 1
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }

    private func loadMore() async {
        guard let response: JSONValue = try? await env.api.get("inventory", query: query(page: page + 1)) else {
            hasMore = false
            return
        }
        let known = Set(items.compactMap(\.recordID))
        items += response.opsArray("data").filter { !known.contains($0.recordID ?? "") }
        hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
        page += 1
    }
}

/// An item handed to a sheet.
struct InventoryItemRef: Identifiable {
    let item: JSONValue
    var id: String { item.recordID ?? "" }
}

// MARK: - Barcode scanning

/// Point the camera at a barcode or QR code; the first one read becomes the
/// search, which matches item codes and SKUs.
struct InventoryScanSheet: View {
    let onCode: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            InventoryBarcodeScanner { code in
                onCode(code)
                dismiss()
            }
            .ignoresSafeArea()
            HStack {
                Text("Scan a barcode")
                    .font(.system(size: 16, weight: .semibold))
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .glassEffect(.regular, in: Capsule())
                Spacer()
                GlassCircleButton(symbol: "xmark", label: "Close") { dismiss() }
            }
            .padding(16)
        }
    }
}

/// VisionKit's live barcode reader.
struct InventoryBarcodeScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    @MainActor static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        try? controller.startScanning()
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        if !controller.isScanning { try? controller.startScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var done = false

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for item in addedItems {
                if case let .barcode(barcode) = item, let value = barcode.payloadStringValue, !value.isEmpty {
                    done = true
                    dataScanner.stopScanning()
                    onCode(value)
                    return
                }
            }
        }
    }
}
