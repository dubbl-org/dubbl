import SwiftUI

/// One item: what's on hand against its reorder point, prices and margin,
/// stock by location and recent movements, with "Adjust stock" at hand.
struct InventoryItemView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var item: JSONValue?
    @State private var locations: [JSONValue] = []
    @State private var movements: [JSONValue] = []
    @State private var error: String?
    @State private var adjusting = false
    @State private var editing = false
    @State private var confirmDelete = false

    private var currency: String { env.session.currency }

    var body: some View {
        ScrollView {
            if let item {
                VStack(alignment: .leading, spacing: 24) {
                    hero(item)
                    pricing(item)
                    if !locations.isEmpty { stockByLocation }
                    history
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }.padding(.top, 80)
            } else {
                SkeletonRows(rows: 8, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Item")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("How is \(item?["name"]?.stringValue ?? "this item") selling, and when should I reorder?", page: "inventory")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if let item {
                        let active = item["isActive"]?.boolValue != false
                        Button { Task { await setActive(!active) } } label: {
                            Label(active ? "Mark inactive" : "Mark active", systemImage: active ? "pause.circle" : "play.circle")
                        }
                        Button(role: .destructive) { confirmDelete = true } label: { Label("Delete item", systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if item != nil {
                PurchasesActionBar {
                    Button { editing = true } label: { Label("Edit", systemImage: "pencil") }
                        .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                    Button { adjusting = true } label: { Label("Adjust stock", systemImage: "plusminus") }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
            }
        }
        .sheet(isPresented: $adjusting) {
            if let item { InventoryAdjustSheet(item: item) { Task { await load() } } }
        }
        .sheet(isPresented: $editing) {
            if let item { InventoryEditItemSheet(item: item) { Task { await load() } } }
        }
        .confirmationDialog("Delete this item?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its stock history stays in your books.")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Sections

    private func hero(_ item: JSONValue) -> some View {
        let onHand = item["quantityOnHand"]?.intValue ?? 0
        let reorder = item["reorderPoint"]?.intValue ?? 0
        let level = Inventory.level(item)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let code = item["code"]?.stringValue {
                    Text(code).font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(DTheme.inkTertiary)
                }
                if let (label, tone) = Inventory.levelLabel(level) {
                    LedgerStatus(text: label, tone: tone)
                } else if item["isActive"]?.boolValue == false {
                    LedgerStatus(text: "Inactive", tone: .neutral)
                } else {
                    LedgerStatus(text: "In stock", tone: .positive)
                }
            }
            Text(item["name"]?.stringValue ?? "Item")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(onHand.formatted())
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .tracking(-1.2)
                    .foregroundStyle(level == "out" ? DTheme.negative : DTheme.ink)
                    .contentTransition(.numericText(value: Double(onHand)))
                Text(item["unitOfMeasure"]?.stringValue ?? "on hand")
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            if reorder > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    OperationsBar(fraction: min(1, Double(onHand) / Double(reorder * 2)), tone: level == nil ? .positive : (level == "out" ? .negative : .warning))
                    Text(onHand <= reorder ? "At or below the reorder point of \(reorder.formatted())" : "\((onHand - reorder).formatted()) above the reorder point of \(reorder.formatted())")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .padding(.top, 2)
            }
            if let description = item["description"]?.stringValue, !description.isEmpty {
                Text(description)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func pricing(_ item: JSONValue) -> some View {
        let sale = item["salePrice"]?.intValue ?? 0
        let purchase = item["purchasePrice"]?.intValue ?? 0
        let average = item["averageCost"]?.intValue ?? 0
        let cost = average > 0 ? average : purchase
        let bookValue = item["totalValue"]?.intValue ?? (item["quantityOnHand"]?.intValue ?? 0) * purchase
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Pricing")
            CardStack {
                DetailRow("Sells for", Money.format(sale, currency: currency))
                DetailRow("Buys for", Money.format(purchase, currency: currency))
                if average > 0, average != purchase {
                    DetailRow("Average cost", Money.format(average, currency: currency))
                }
                if let margin = Inventory.margin(sale: sale, cost: cost) {
                    DetailRow("Margin", margin)
                }
                DetailRow("Stock value", Money.format(bookValue, currency: currency))
                if let sku = item["sku"]?.stringValue, !sku.isEmpty {
                    DetailRow(label: "SKU") { Text(sku).font(.system(size: 15, design: .monospaced)) }
                }
                if let method = item["costMethod"]?.stringValue {
                    DetailRow("Costing", method == "fifo" ? "FIFO" : method.humanized)
                }
            }
        }
    }

    private var stockByLocation: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("By location")
            CardStack {
                ForEach(locations, id: \.recordID) { stock in
                    OperationsCardRow(title: stock["warehouseName"]?.stringValue ?? "Location", subtitle: stock["warehouseCode"]?.stringValue) {
                        Text((stock["quantity"]?.intValue ?? 0).formatted())
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                }
            }
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Movements")
            if movements.isEmpty {
                Text("Purchases, sales and adjustments show up here.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack {
                    ForEach(movements, id: \.recordID) { movement in
                        let quantity = movement["quantity"]?.intValue ?? 0
                        let value = movement["value"]?.intValue ?? 0
                        let subtitle = [
                            DubblDate.short(movement["createdAt"]?.stringValue),
                            movement["reason"]?.stringValue,
                            quantity != 0 ? movement["newQuantity"]?.intValue.map { "now \($0.formatted())" } : nil,
                        ].compactMap { $0 }.filter { !$0.isEmpty }
                        OperationsCardRow(title: Inventory.movementTitle(movement), subtitle: subtitle.joined(separator: " · ")) {
                            if quantity != 0 {
                                Text(quantity > 0 ? "+\(quantity.formatted())" : quantity.formatted())
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(quantity > 0 ? DTheme.positive : DTheme.ink)
                            } else {
                                OperationsMoney(minor: value, currency: currency, tone: value < 0 ? DTheme.negative : DTheme.ink)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Loading and actions

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("inventory/\(id)")
            async let stock: JSONValue? = try? env.api.get("inventory/\(id)/warehouse-stock")
            async let moves: JSONValue? = try? env.api.get("inventory/\(id)/movements", query: ["limit": "25"])
            let (stockResponse, movesResponse) = await (stock, moves)
            withAnimation(.snappy) {
                item = response["inventoryItem"] ?? response
                locations = stockResponse?.opsArray("data") ?? []
                movements = movesResponse?.opsArray("data") ?? []
                error = nil
            }
        } catch {
            if item == nil { self.error = error.localizedDescription }
        }
    }

    private func setActive(_ active: Bool) async {
        do {
            let _: JSONValue = try await env.api.patch("inventory/\(id)", body: InventoryActiveBody(isActive: active))
            env.toast.show(active ? "Item active" : "Item inactive")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            if OperationsFormat.isDemo, let item { self.item = item.opsSetting("isActive", .bool(active)) } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("inventory/\(id)")
            env.toast.show("Item deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

// MARK: - New and edit

/// A new stock item. Opening stock is only booked when it has a cost.
struct InventoryNewItemSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var code = ""
    @State private var sku = ""
    @State private var sale = 0
    @State private var purchase = 0
    @State private var opening = ""
    @State private var reorder = ""
    @State private var category = ""
    @State private var categories: [JSONValue] = []
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool { OperationsFormat.trimmed(name) != nil && OperationsFormat.trimmed(code) != nil }

    var body: some View {
        OperationsFormSheet(title: "New item", confirm: "Add", canSave: canSave, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("e.g. Linen notebook A5", text: $name) }
                FieldRow(label: "Code") {
                    TextField("e.g. NB-A5-LIN", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(size: 16, design: .monospaced))
                }
                FieldRow(label: "SKU or barcode") {
                    TextField("Optional", text: $sku).autocorrectionDisabled().textInputAutocapitalization(.never)
                }
                if !categories.isEmpty {
                    OperationsPickerRow(label: "Category", selection: $category, options: [("", "None")] + categories.compactMap { item in
                        item.recordID.map { ($0, item["name"]?.stringValue ?? "Category") }
                    })
                }
            }
            CardStack {
                FieldRow(label: "Sells for") { AmountField(minor: $sale, currency: env.session.currency) }
                FieldRow(label: "Buys for") { AmountField(minor: $purchase, currency: env.session.currency) }
            }
            VStack(alignment: .leading, spacing: 8) {
                CardStack {
                    FieldRow(label: "Opening stock") { TextField("0", text: $opening).keyboardType(.numberPad) }
                    FieldRow(label: "Reorder when at or below") { TextField("0", text: $reorder).keyboardType(.numberPad) }
                }
                Text("Opening stock is booked at the buy price, so it needs one.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.horizontal, 4)
            }
        }
        .presentationDetents([.large])
        .task {
            if let response: JSONValue = try? await env.api.get("inventory/categories") {
                categories = response.opsArray("flat")
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let body = InventoryItemBody(
            code: code.trimmingCharacters(in: .whitespaces),
            name: name.trimmingCharacters(in: .whitespaces),
            description: nil,
            categoryId: category.isEmpty ? nil : category,
            sku: OperationsFormat.trimmed(sku),
            purchasePrice: purchase,
            salePrice: sale,
            quantityOnHand: Int(opening) ?? 0,
            reorderPoint: Int(reorder) ?? 0
        )
        do {
            let _: JSONValue = try await env.api.post("inventory", body: body)
            env.toast.show("Item added")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Name, SKU, prices and reorder point. Counts change through adjustments.
struct InventoryEditItemSheet: View {
    let item: JSONValue
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var sku = ""
    @State private var description = ""
    @State private var sale = 0
    @State private var purchase = 0
    @State private var reorder = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "Edit item", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("Name", text: $name) }
                FieldRow(label: "SKU or barcode") { TextField("Optional", text: $sku).autocorrectionDisabled().textInputAutocapitalization(.never) }
                FieldRow(label: "Description") { TextField("Optional", text: $description, axis: .vertical).lineLimit(1 ... 4) }
            }
            CardStack {
                FieldRow(label: "Sells for") { AmountField(minor: $sale, currency: env.session.currency) }
                FieldRow(label: "Buys for") { AmountField(minor: $purchase, currency: env.session.currency) }
                FieldRow(label: "Reorder when at or below") { TextField("0", text: $reorder).keyboardType(.numberPad) }
            }
        }
        .presentationDetents([.large])
        .onAppear {
            name = item["name"]?.stringValue ?? ""
            sku = item["sku"]?.stringValue ?? ""
            description = item["description"]?.stringValue ?? ""
            sale = item["salePrice"]?.intValue ?? 0
            purchase = item["purchasePrice"]?.intValue ?? 0
            reorder = "\(item["reorderPoint"]?.intValue ?? 0)"
        }
    }

    private func save() async {
        guard let id = item.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        let body = InventoryItemEditBody(
            name: name.trimmingCharacters(in: .whitespaces),
            description: OperationsFormat.trimmed(description),
            sku: OperationsFormat.trimmed(sku),
            purchasePrice: purchase,
            salePrice: sale,
            reorderPoint: Int(reorder) ?? 0
        )
        do {
            let _: JSONValue = try await env.api.patch("inventory/\(id)", body: body)
            env.toast.show("Item saved")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
