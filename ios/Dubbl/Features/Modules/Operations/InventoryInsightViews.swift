import Charts
import SwiftUI

// Bills of materials, assembly orders, reorder alerts and stock value.

// MARK: - Bill of materials

/// A recipe: what one finished item takes, what it costs to make, and a
/// button to build some.
struct InventoryBOMView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var building = false

    private var currency: String { env.session.currency }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { response in
            let bom = response["bom"] ?? response
            let cost = response["costBreakdown"]
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        if bom["isActive"]?.boolValue == false { LedgerStatus(text: "Inactive", tone: .neutral) }
                        Text(bom["name"]?.stringValue ?? "Bill of materials")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(bom["assemblyItem.name"]?.stringValue ?? "Item")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.6)
                            .foregroundStyle(DTheme.ink)
                        if let total = cost?["totalCost"]?.intValue {
                            Text("Costs \(Money.format(total, currency: currency)) to make one")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                        if let description = bom["description"]?.stringValue, !description.isEmpty {
                            Text(description).font(.system(size: 14)).foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    let components = bom.opsArray("components")
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Components · \(components.count)")
                        CardStack {
                            ForEach(components, id: \.recordID) { component in
                                let quantity = OperationsFormat.double(component["quantity"]) ?? 0
                                let wastage = OperationsFormat.double(component["wastagePercent"]) ?? 0
                                let unit = component["componentItem.purchasePrice"]?.intValue ?? 0
                                let lineCost = Int((quantity * (1 + wastage / 100) * Double(unit)).rounded())
                                let onHand = component["componentItem.quantityOnHand"]?.intValue
                                let subtitle = [
                                    "\(OperationsFormat.number(quantity)) × \(Money.format(unit, currency: currency))",
                                    wastage > 0 ? "+\(OperationsFormat.number(wastage))% wastage" : nil,
                                    onHand.map { "\($0.formatted()) on hand" },
                                ].compactMap { $0 }.joined(separator: " · ")
                                NavigationLink(value: RecordRoute(spec: "inventory-items", id: component["componentItemId"]?.stringValue ?? "")) {
                                    OperationsCardRow(title: component["componentItem.name"]?.stringValue ?? "Component", subtitle: subtitle) {
                                        OperationsMoney(minor: lineCost, currency: currency)
                                    }
                                }
                                .buttonStyle(RowPressStyle())
                            }
                        }
                    }

                    if let cost {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Cost to make one")
                            CardStack {
                                DetailRow("Components", Money.format(cost["componentCost"]?.intValue ?? 0, currency: currency))
                                DetailRow("Labour", Money.format(cost["laborCost"]?.intValue ?? 0, currency: currency))
                                DetailRow("Overhead", Money.format(cost["overheadCost"]?.intValue ?? 0, currency: currency))
                                DetailRow(label: "Total") {
                                    Text(Money.format(cost["totalCost"]?.intValue ?? 0, currency: currency)).fontWeight(.semibold).monospacedDigit()
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            }
            .safeAreaInset(edge: .bottom) {
                PurchasesActionBar {
                    Button { building = true } label: { Label("Build", systemImage: "hammer") }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                }
            }
            .sheet(isPresented: $building) {
                InventoryNewAssemblySheet(bomId: id) {}
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Bill of materials")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        await loader.load(env.api, "inventory/bom/\(id)")
    }
}

struct InventoryAssemblyBody: Encodable, Sendable {
    var bomId: String
    var quantity: Int
    var notes: String?
}

/// Plan a build: which recipe and how many.
struct InventoryNewAssemblySheet: View {
    var bomId: String?
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var boms: [JSONValue] = []
    @State private var bom = ""
    @State private var quantity = 1
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "New assembly order", confirm: "Create", canSave: !bom.isEmpty && quantity > 0, saving: saving, error: error, onSave: save) {
            CardStack {
                OperationsPickerRow(label: "Make", selection: $bom, options: [("", boms.isEmpty ? "Loading…" : "Choose")] + boms.compactMap { item in
                    item.recordID.map { ($0, item["assemblyItem.name"]?.stringValue ?? item["name"]?.stringValue ?? "Item") }
                })
                Stepper(value: $quantity, in: 1 ... 100_000) {
                    HStack {
                        Text("Quantity").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                        Spacer()
                        Text(quantity.formatted()).font(DFont.figure(15, weight: .semibold)).foregroundStyle(DTheme.ink)
                    }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                FieldRow(label: "Notes") { TextField("Optional", text: $notes) }
            }
            Text("Completing the order uses up the components and adds the finished items to stock.")
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkTertiary)
                .padding(.horizontal, 4)
        }
        .presentationDetents([.medium, .large])
        .task {
            if let response: JSONValue = try? await env.api.get("inventory/bom") {
                boms = response.opsArray("data").filter { $0["isActive"]?.boolValue != false }
            }
            if let bomId { bom = bomId } else if bom.isEmpty { bom = boms.first?.recordID ?? "" }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("inventory/assembly-orders", body: InventoryAssemblyBody(bomId: bom, quantity: quantity, notes: OperationsFormat.trimmed(notes)))
            env.toast.show("Assembly order created")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-assembly")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Assembly orders

/// Builds in progress and done. Tap one to start, complete or cancel it.
struct InventoryAssemblyView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var filter = "all"
    @State private var creating = false
    @State private var acting: JSONValue?
    @State private var working: String?

    private static let statuses: [(value: String, label: String)] = [
        ("draft", "Draft"), ("in_progress", "In progress"), ("completed", "Completed"), ("cancelled", "Cancelled"),
    ]

    private var orders: [JSONValue] {
        let all = (loader.value?.opsArray("data") ?? []).reversed().map { $0 }
        return filter == "all" ? all : all.filter { $0["status"]?.stringValue == filter }
    }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { _ in
            if orders.isEmpty {
                EmptyStateView(
                    symbol: "hammer",
                    title: filter == "all" ? "No assembly orders" : "Nothing here",
                    message: "Build finished items from their bill of materials.",
                    actionTitle: filter == "all" ? "New order" : nil,
                    action: { creating = true }
                )
                .frame(maxHeight: .infinity)
            } else {
                List {
                    ForEach(orders, id: \.recordID) { order in
                        Button { acting = order } label: { row(order) }
                            .buttonStyle(RowPressStyle())
                            .ledgerRow()
                            .disabled(working != nil)
                    }
                    LedgerEndMarker(text: "\(orders.count) \(orders.count == 1 ? "order" : "orders")")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Assembly orders")
        .navigationSubtitle(loader.isLoaded ? "\(orders.count)" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Status", selection: $filter) {
                        Text("All").tag("all")
                        ForEach(Self.statuses, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityLabel("Filter by status")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("New order", systemImage: "plus") { creating = true }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == "inventory-assembly" { Task { await load() } }
        }
        .sheet(isPresented: $creating) {
            InventoryNewAssemblySheet { Task { await load() } }
        }
        .confirmationDialog(
            acting.map { "\(($0["quantity"]?.intValue ?? 0).formatted()) × \($0["bom.assemblyItem.name"]?.stringValue ?? "item")" } ?? "",
            isPresented: Binding(get: { acting != nil }, set: { if !$0 { acting = nil } }),
            titleVisibility: .visible
        ) {
            if let order = acting, let id = order.recordID {
                let status = order["status"]?.stringValue ?? "draft"
                if status == "draft" {
                    Button("Start") { Task { await patch(id, "in_progress", done: "Order started") } }
                }
                if status == "draft" || status == "in_progress" {
                    Button("Complete and add to stock") { Task { await complete(id) } }
                    Button("Cancel order", role: .destructive) { Task { await patch(id, "cancelled", done: "Order cancelled") } }
                }
                if let bomId = order["bomId"]?.stringValue {
                    NavigationLink("Open bill of materials", value: RecordRoute(spec: "inventory-bom", id: bomId))
                }
            }
            Button("Close", role: .cancel) {}
        }
    }

    private func row(_ order: JSONValue) -> some View {
        let status = order["status"]?.stringValue ?? "draft"
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(order["bom.assemblyItem.name"]?.stringValue ?? order["bom.name"]?.stringValue ?? "Assembly")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([order["bom.name"]?.stringValue, DubblDate.short(order["completedAt"]?.stringValue ?? order["createdAt"]?.stringValue), order["notes"]?.stringValue]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text("× \((order["quantity"]?.intValue ?? 0).formatted())")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                if working == order.recordID {
                    ProgressView().controlSize(.small)
                } else {
                    LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                }
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        await loader.load(env.api, "inventory/assembly-orders")
    }

    private func patch(_ id: String, _ status: String, done: String) async {
        working = id
        defer { working = nil }
        do {
            let _: JSONValue = try await env.api.patch("inventory/assembly-orders/\(id)", body: InventoryStatusBody(status: status))
            env.toast.show(done)
            await reflect(id, status)
        } catch {
            env.toast.error(error)
        }
    }

    private func complete(_ id: String) async {
        working = id
        defer { working = nil }
        do {
            let _: JSONValue = try await env.api.post("inventory/assembly-orders/\(id)/complete")
            env.toast.show("Built and added to stock")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            await reflect(id, "completed")
        } catch {
            env.toast.error(error)
        }
    }

    /// Demo fixtures don't change, so show the new status locally there.
    private func reflect(_ id: String, _ status: String) async {
        if OperationsFormat.isDemo, let value = loader.value {
            let rows = value.opsArray("data").map { $0.recordID == id ? $0.opsSetting("status", .string(status)) : $0 }
            loader.set(value.opsSetting("data", .array(rows)))
        } else {
            await load()
        }
    }
}

// MARK: - Reorder alerts

/// Items at or below their reorder point, with how many to order (twice the
/// reorder point less what's on hand) and who supplies them.
struct InventoryAlertsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var adjusting: InventoryItemRef?

    private var items: [JSONValue] {
        (loader.value?.opsArray("data") ?? []).sorted {
            ($0["quantityOnHand"]?.intValue ?? 0, $0["name"]?.stringValue ?? "") < ($1["quantityOnHand"]?.intValue ?? 0, $1["name"]?.stringValue ?? "")
        }
    }

    private func supplier(_ item: JSONValue) -> JSONValue? { item.opsArray("suppliers").first }

    private func reorderCost(_ item: JSONValue) -> Int {
        let quantity = item["suggestedReorderQuantity"]?.intValue ?? 0
        let price = supplier(item)?["purchasePrice"]?.intValue ?? item["purchasePrice"]?.intValue ?? 0
        return max(quantity, 0) * price
    }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { _ in
            if items.isEmpty {
                EmptyStateView(symbol: "checkmark.seal", title: "Nothing to reorder", message: "Every item is above its reorder point.")
                    .frame(maxHeight: .infinity)
            } else {
                List {
                    let out = items.filter { ($0["quantityOnHand"]?.intValue ?? 0) <= 0 }.count
                    LedgerTotals(items: [
                        .init(label: "To reorder", value: "\(items.count)", detail: "\(out) out of stock", tint: DTheme.warning),
                        .init(label: "Estimated cost", value: Money.short(items.reduce(0) { $0 + reorderCost($1) }, currency: env.session.currency), detail: "At supplier prices", tint: DTheme.info),
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()
                    ForEach(items, id: \.recordID) { item in
                        NavigationLink(value: RecordRoute(spec: "inventory-items", id: item.recordID ?? "")) {
                            row(item)
                        }
                        .navigationLinkIndicatorVisibility(.hidden)
                        .ledgerRow()
                        .swipeActions(edge: .leading) {
                            Button { adjusting = InventoryItemRef(item: item) } label: { Label("Adjust", systemImage: "plusminus") }
                                .tint(DTheme.info)
                        }
                    }
                    LedgerEndMarker(text: "\(items.count) \(items.count == 1 ? "item" : "items") to reorder")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Reorder alerts")
        .navigationSubtitle(loader.isLoaded ? "\(items.count)" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    env.router.askTilly("Draft purchase orders for the items that are low on stock.", page: "inventory")
                } label: {
                    Image(systemName: "sparkle")
                }
                .accessibilityLabel("Ask Tilly")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $adjusting) { ref in
            InventoryAdjustSheet(item: ref.item) { Task { await load() } }
        }
    }

    private func row(_ item: JSONValue) -> some View {
        let onHand = item["quantityOnHand"]?.intValue ?? 0
        let reorder = item["reorderPoint"]?.intValue ?? 0
        let suggested = item["suggestedReorderQuantity"]?.intValue ?? 0
        let supplier = supplier(item)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item["name"]?.stringValue ?? "Item")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    let supplierLine = [
                        supplier?["contactName"]?.stringValue,
                        supplier?["leadTimeDays"]?.intValue.map { "\($0)-day lead time" },
                    ].compactMap { $0 }
                    Text(supplierLine.isEmpty ? "No supplier set" : supplierLine.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Order \(suggested.formatted())")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                    Text(Money.format(reorderCost(item), currency: env.session.currency))
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            HStack(spacing: 8) {
                OperationsBar(fraction: reorder > 0 ? Double(onHand) / Double(reorder) : 0, tone: onHand <= 0 ? .negative : .warning, height: 5)
                Text("\(onHand.formatted()) of \(reorder.formatted())")
                    .font(DFont.figure(12))
                    .foregroundStyle(onHand <= 0 ? DTheme.negative : DTheme.warning)
                    .fixedSize()
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        await loader.load(env.api, "inventory/reorder-suggestions")
    }
}

// MARK: - Stock value

/// What stock is worth at cost and at sale price, which items hold the most
/// value, and the margin on each.
struct InventoryValuationView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var sort = "totalCost"

    private static let sorts: [(value: String, label: String)] = [
        ("totalCost", "Value at cost"), ("totalValue", "Value at sale price"), ("marginPercent", "Margin"), ("quantity", "Quantity"), ("name", "Name"),
    ]

    private var currency: String { env.session.currency }

    private var items: [JSONValue] {
        let all = loader.value?.opsArray("items") ?? []
        func key(_ item: JSONValue) -> Double {
            switch sort {
            case "quantity": OperationsFormat.double(item["quantityOnHand"]) ?? 0
            case "marginPercent": OperationsFormat.double(item["marginPercent"]) ?? 0
            default: OperationsFormat.double(item[sort]) ?? 0
            }
        }
        if sort == "name" { return all.sorted { ($0["name"]?.stringValue ?? "") < ($1["name"]?.stringValue ?? "") } }
        return all.sorted { key($0) > key($1) }
    }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { data in
            let summary = data["summary"]
            let cost = summary?["totalCost"]?.intValue ?? 0
            let retail = summary?["totalValue"]?.intValue ?? 0
            List {
                LedgerTotals(items: [
                    .init(label: "At cost", value: Money.short(cost, currency: currency), detail: "\(summary?["totalItems"]?.intValue ?? 0) items", tint: DTheme.info),
                    .init(label: "Retail", value: Money.short(retail, currency: currency), detail: "If it all sold", tint: DTheme.positive),
                    .init(label: "Margin", value: summary?["totalMargin"].flatMap(OperationsFormat.double).map { "\(Int($0.rounded()))%" }, detail: "On sale price", tint: DTheme.special),
                ])
                .padding(.vertical, 14)
                .ledgerRow()

                let top = Array(items.filter { ($0["totalCost"]?.intValue ?? 0) > 0 }.sorted { ($0["totalCost"]?.intValue ?? 0) > ($1["totalCost"]?.intValue ?? 0) }.prefix(6))
                if !top.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Where the value sits")
                            .font(.system(size: 13.5, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        Chart(top, id: \.recordID) { item in
                            BarMark(
                                x: .value("Value", Double(item["totalCost"]?.intValue ?? 0) / 100),
                                y: .value("Item", item["name"]?.stringValue ?? "Item")
                            )
                            .foregroundStyle(DTheme.chartPrimary.gradient)
                            .cornerRadius(4)
                        }
                        .chartXAxis {
                            AxisMarks(values: .automatic(desiredCount: 3)) { value in
                                AxisGridLine().foregroundStyle(DTheme.hairline)
                                AxisValueLabel {
                                    if let amount = value.as(Double.self) {
                                        Text(Money.short(Int(amount * 100), currency: currency)).font(.system(size: 11))
                                    }
                                }
                            }
                        }
                        .chartYAxis {
                            AxisMarks { _ in AxisValueLabel().font(.system(size: 12)).foregroundStyle(DTheme.inkSecondary) }
                        }
                        .frame(height: CGFloat(top.count) * 34 + 24)
                    }
                    .padding(.vertical, 12)
                    .ledgerRow()
                }

                ForEach(items, id: \.recordID) { item in
                    NavigationLink(value: RecordRoute(spec: "inventory-items", id: item.recordID ?? "")) {
                        row(item)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                }
                LedgerEndMarker(text: "\(items.count) active \(items.count == 1 ? "item" : "items")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .background(DTheme.canvas)
        .navigationTitle("Stock value")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort by", selection: $sort) {
                        ForEach(Self.sorts, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
                .accessibilityLabel("Sort")
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ item: JSONValue) -> some View {
        let quantity = item["quantityOnHand"]?.intValue ?? 0
        let margin = OperationsFormat.double(item["marginPercent"])
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(item["name"]?.stringValue ?? "Item")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let code = item["code"]?.stringValue {
                        Text(code).font(.system(size: 12.5, weight: .medium, design: .monospaced)).foregroundStyle(DTheme.inkTertiary)
                    }
                    Text("\(quantity.formatted()) × \(Money.format(item["unitCost"]?.intValue ?? 0, currency: currency))")
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 5) {
                OperationsMoney(minor: item["totalCost"]?.intValue ?? 0, currency: currency, size: 16)
                if let margin {
                    Text("\(OperationsFormat.number((margin * 10).rounded() / 10))% margin")
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(margin < 0 ? DTheme.negative : DTheme.inkSecondary)
                }
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        await loader.load(env.api, "reports/inventory-valuation", query: ["sortBy": "totalCost", "sortOrder": "desc"])
    }
}
