import SwiftUI

// Locations, transfers between them, and stocktakes.

// MARK: - Locations

/// A location (warehouse): its address and what's stocked there.
struct InventoryLocationView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var warehouse: JSONValue?
    @State private var stock: [JSONValue] = []
    @State private var error: String?
    @State private var confirmDelete = false

    var body: some View {
        ScrollView {
            if let warehouse {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            if let code = warehouse["code"]?.stringValue {
                                Text(code).font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(DTheme.inkTertiary)
                            }
                            if warehouse["isDefault"]?.boolValue == true { LedgerStatus(text: "Default", tone: .info) }
                            if warehouse["isActive"]?.boolValue == false { LedgerStatus(text: "Inactive", tone: .neutral) }
                        }
                        Text(warehouse["name"]?.stringValue ?? "Location")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.6)
                            .foregroundStyle(DTheme.ink)
                        if let address = warehouse["address"]?.stringValue, !address.isEmpty {
                            Text(address).font(.system(size: 14)).foregroundStyle(DTheme.inkSecondary)
                        }
                        let units = stock.reduce(0) { $0 + ($1["quantity"]?.intValue ?? 0) }
                        Text("\(stock.count) \(stock.count == 1 ? "item" : "items") · \(Inventory.units(units))")
                            .font(.system(size: 14))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Stock here")
                        if stock.isEmpty {
                            Text("Nothing is stocked here yet. Transfers and stocktakes fill it in.")
                                .font(.system(size: 14))
                                .foregroundStyle(DTheme.inkSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                        } else {
                            CardStack {
                                ForEach(stock, id: \.recordID) { row in
                                    NavigationLink(value: RecordRoute(spec: "inventory-items", id: row["inventoryItemId"]?.stringValue ?? "")) {
                                        OperationsCardRow(title: row["itemName"]?.stringValue ?? "Item", subtitle: row["itemCode"]?.stringValue) {
                                            Text((row["quantity"]?.intValue ?? 0).formatted())
                                                .font(.system(size: 16, weight: .semibold, design: .rounded))
                                                .monospacedDigit()
                                                .foregroundStyle(DTheme.ink)
                                        }
                                    }
                                    .buttonStyle(RowPressStyle())
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            } else if let error {
                ErrorStateView(message: error) { await load() }.padding(.top, 80)
            } else {
                SkeletonRows(rows: 8, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Location")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let warehouse {
                        if warehouse["isDefault"]?.boolValue != true {
                            Button { Task { await patch(["isDefault": .bool(true)], done: "Default location set") } } label: { Label("Make default", systemImage: "star") }
                        }
                        let active = warehouse["isActive"]?.boolValue != false
                        Button { Task { await patch(["isActive": .bool(!active)], done: active ? "Location inactive" : "Location active") } } label: {
                            Label(active ? "Mark inactive" : "Mark active", systemImage: active ? "pause.circle" : "play.circle")
                        }
                        Button(role: .destructive) { confirmDelete = true } label: { Label("Delete location", systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .confirmationDialog("Delete this location?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("warehouses/\(id)")
            let stockResponse: JSONValue? = try? await env.api.get("warehouses/\(id)/stock")
            withAnimation(.snappy) {
                warehouse = response["warehouse"] ?? response
                stock = (stockResponse?.opsArray("data") ?? []).sorted { ($0["itemName"]?.stringValue ?? "") < ($1["itemName"]?.stringValue ?? "") }
                error = nil
            }
        } catch {
            if warehouse == nil { self.error = error.localizedDescription }
        }
    }

    private func patch(_ body: [String: JSONValue], done: String) async {
        do {
            let _: JSONValue = try await env.api.patch("warehouses/\(id)", body: body)
            env.toast.show(done)
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-locations")
            if OperationsFormat.isDemo, var updated = warehouse {
                for (key, value) in body { updated = updated.opsSetting(key, value) }
                warehouse = updated
            } else {
                await load()
            }
        } catch {
            env.toast.error(error)
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("warehouses/\(id)")
            env.toast.show("Location deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-locations")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

struct InventoryLocationBody: Encodable, Sendable {
    var name: String
    var code: String
    var address: String?
    var isDefault: Bool
}

/// A new location: name, short code and address.
struct InventoryNewLocationSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var code = ""
    @State private var address = ""
    @State private var isDefault = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(
            title: "New location",
            confirm: "Add",
            canSave: OperationsFormat.trimmed(name) != nil && OperationsFormat.trimmed(code) != nil,
            saving: saving,
            error: error,
            onSave: save
        ) {
            CardStack {
                FieldRow(label: "Name") { TextField("e.g. Main warehouse", text: $name) }
                FieldRow(label: "Code") {
                    TextField("e.g. MAIN", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(size: 16, design: .monospaced))
                }
                FieldRow(label: "Address") { TextField("Optional", text: $address, axis: .vertical).lineLimit(1 ... 3) }
            }
            CardStack {
                Toggle(isOn: $isDefault) {
                    Text("Default location").font(.system(size: 15)).foregroundStyle(DTheme.ink)
                }
                .tint(DTheme.positive)
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = InventoryLocationBody(
                name: name.trimmingCharacters(in: .whitespaces),
                code: code.trimmingCharacters(in: .whitespaces),
                address: OperationsFormat.trimmed(address),
                isDefault: isDefault
            )
            let _: JSONValue = try await env.api.post("warehouses", body: body)
            env.toast.show("Location added")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Categories

struct InventoryCategoryBody: Encodable, Sendable {
    var name: String
    var description: String?
    var parentId: String?
}

/// A new category, optionally inside another.
struct InventoryNewCategorySheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var parent = ""
    @State private var categories: [JSONValue] = []
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "New category", confirm: "Add", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("e.g. Stationery", text: $name) }
                FieldRow(label: "Description") { TextField("Optional", text: $description) }
                if !categories.isEmpty {
                    OperationsPickerRow(label: "Inside", selection: $parent, options: [("", "Top level")] + categories.compactMap { item in
                        item.recordID.map { ($0, item["name"]?.stringValue ?? "Category") }
                    })
                }
            }
        }
        .presentationDetents([.medium])
        .task {
            if let response: JSONValue = try? await env.api.get("inventory/categories") {
                categories = response.opsArray("data")
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = InventoryCategoryBody(
                name: name.trimmingCharacters(in: .whitespaces),
                description: OperationsFormat.trimmed(description),
                parentId: parent.isEmpty ? nil : parent
            )
            let _: JSONValue = try await env.api.post("inventory/categories", body: body)
            env.toast.show("Category added")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Transfers

enum InventoryTransfers {
    static let statuses: [(value: String, label: String)] = [
        ("draft", "Draft"), ("in_transit", "In transit"), ("completed", "Completed"), ("cancelled", "Cancelled"),
    ]

    static func tone(_ status: String?) -> Tone {
        switch status {
        case "in_transit": .info
        case "completed": .positive
        case "cancelled": .negative
        default: .neutral
        }
    }

    static func route(_ transfer: JSONValue) -> String {
        "\(transfer["fromWarehouse.name"]?.stringValue ?? "?") → \(transfer["toWarehouse.name"]?.stringValue ?? "?")"
    }
}

/// Stock moving between locations, newest first.
struct InventoryTransfersView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = OperationsLoader()
    @State private var filter = "all"
    @State private var creating = false

    private var transfers: [JSONValue] {
        let all = loader.value?.opsArray("data") ?? []
        return filter == "all" ? all : all.filter { $0["status"]?.stringValue == filter }
    }

    var body: some View {
        OperationsLoadState(loader: loader, retry: load) { _ in
            if transfers.isEmpty {
                EmptyStateView(
                    symbol: "arrow.left.arrow.right",
                    title: filter == "all" ? "No transfers yet" : "Nothing here",
                    message: "Move stock from one location to another.",
                    actionTitle: filter == "all" ? "New transfer" : nil,
                    action: { creating = true }
                )
                .frame(maxHeight: .infinity)
            } else {
                List {
                    ForEach(transfers, id: \.recordID) { transfer in
                        NavigationLink(value: RecordRoute(spec: "inventory-transfers", id: transfer.recordID ?? "")) {
                            row(transfer)
                        }
                        .navigationLinkIndicatorVisibility(.hidden)
                        .ledgerRow()
                    }
                    LedgerEndMarker(text: "\(transfers.count) \(transfers.count == 1 ? "transfer" : "transfers")")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Transfers")
        .navigationSubtitle(loader.isLoaded ? "\(transfers.count)" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Status", selection: $filter) {
                        Text("All").tag("all")
                        ForEach(InventoryTransfers.statuses, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityLabel("Filter by status")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("New transfer", systemImage: "plus") { creating = true }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == "inventory-transfers" { Task { await load() } }
        }
        .sheet(isPresented: $creating) {
            InventoryNewTransferSheet { Task { await load() } }
        }
    }

    private func row(_ transfer: JSONValue) -> some View {
        let lines = transfer.opsArray("lines")
        let units = lines.reduce(0) { $0 + ($1["quantity"]?.intValue ?? 0) }
        let status = transfer["status"]?.stringValue ?? "draft"
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(InventoryTransfers.route(transfer))
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([
                    "\(lines.count) \(lines.count == 1 ? "line" : "lines")",
                    DubblDate.short(transfer["completedAt"]?.stringValue ?? transfer["createdAt"]?.stringValue),
                    transfer["notes"]?.stringValue,
                ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkSecondary)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Inventory.units(units))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: InventoryTransfers.tone(status))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        await loader.load(env.api, "inventory/transfers")
    }
}

/// A transfer: where from and to, what's moving, and the next step.
struct InventoryTransferView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var transfer: JSONValue?
    @State private var lookup = InventoryLookup()
    @State private var error: String?
    @State private var working: String?
    @State private var confirmCancel = false

    private var status: String { transfer?["status"]?.stringValue ?? "draft" }

    var body: some View {
        ScrollView {
            if let transfer {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        LedgerStatus(text: RecordFormat.statusLabel(status), tone: InventoryTransfers.tone(status))
                        HStack(spacing: 12) {
                            place("From", transfer["fromWarehouse.name"]?.stringValue)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(DTheme.inkTertiary)
                            place("To", transfer["toWarehouse.name"]?.stringValue)
                        }
                        let dates = [
                            transfer["createdAt"]?.stringValue.map { "Created \(DubblDate.short($0))" },
                            transfer["completedAt"]?.stringValue.map { "Received \(DubblDate.short($0))" },
                        ].compactMap { $0 }
                        Text(dates.joined(separator: " · ")).font(.system(size: 14)).foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    let lines = transfer.opsArray("lines")
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Items · \(lines.count)")
                        CardStack {
                            ForEach(lines, id: \.recordID) { line in
                                let itemId = line["inventoryItemId"]?.stringValue
                                let item = lookup.item(itemId)
                                let received = line["receivedQuantity"]?.intValue
                                OperationsCardRow(
                                    title: item?["name"]?.stringValue ?? "Item",
                                    subtitle: [item?["code"]?.stringValue, received.map { "\($0.formatted()) received" }].compactMap { $0 }.joined(separator: " · ")
                                ) {
                                    Text((line["quantity"]?.intValue ?? 0).formatted())
                                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                                        .monospacedDigit()
                                        .foregroundStyle(DTheme.ink)
                                }
                            }
                        }
                    }
                    if let notes = transfer["notes"]?.stringValue, !notes.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Notes")
                            Text(notes).font(.system(size: 15)).foregroundStyle(DTheme.ink).frame(maxWidth: .infinity, alignment: .leading).dubblCard()
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }.padding(.top, 80)
            } else {
                SkeletonRows(rows: 6, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Transfer")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if status == "draft" || status == "in_transit" {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) { confirmCancel = true } label: { Label("Cancel transfer", systemImage: "xmark.circle") }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("More actions")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if transfer != nil, status == "draft" || status == "in_transit" {
                PurchasesActionBar {
                    if status == "draft" {
                        Button { Task { await setStatus("in_transit", done: "Marked in transit") } } label: { Label("Send", systemImage: "shippingbox") }
                            .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                            .disabled(working != nil)
                    }
                    Button { Task { await complete() } } label: {
                        HStack(spacing: 8) {
                            if working == "complete" { ProgressView().controlSize(.small).tint(DTheme.inkInverse) } else { Image(systemName: "checkmark") }
                            Text(status == "draft" ? "Complete" : "Receive")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(working != nil)
                }
            }
        }
        .confirmationDialog("Cancel this transfer?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel transfer", role: .destructive) { Task { await setStatus("cancelled", done: "Transfer cancelled") } }
            Button("Keep it", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func place(_ label: String, _ name: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 12.5, weight: .medium)).foregroundStyle(DTheme.inkTertiary)
            Text(name ?? "–").font(.system(size: 19, weight: .semibold)).foregroundStyle(DTheme.ink).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("inventory/transfers/\(id)")
            await lookup.loadItems(env.api)
            withAnimation(.snappy) {
                transfer = response["transfer"] ?? response
                error = nil
            }
        } catch {
            if transfer == nil { self.error = error.localizedDescription }
        }
    }

    private func setStatus(_ status: String, done: String) async {
        working = status
        defer { working = nil }
        do {
            let _: JSONValue = try await env.api.patch("inventory/transfers/\(id)", body: InventoryStatusBody(status: status))
            env.toast.show(done)
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-transfers")
            if OperationsFormat.isDemo, let transfer { self.transfer = transfer.opsSetting("status", .string(status)) } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }

    private func complete() async {
        working = "complete"
        defer { working = nil }
        do {
            let _: JSONValue = try await env.api.post("inventory/transfers/\(id)/complete")
            env.toast.show("Stock moved")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-transfers")
            if OperationsFormat.isDemo, let transfer {
                self.transfer = transfer.opsSetting("status", .string("completed")).opsSetting("completedAt", .string(Date.now.formatted(.iso8601)))
            } else {
                await load()
            }
        } catch {
            env.toast.error(error)
        }
    }
}

struct InventoryTransferBody: Encodable, Sendable {
    struct Line: Encodable, Sendable {
        var inventoryItemId: String
        var quantity: Int
    }

    var fromWarehouseId: String
    var toWarehouseId: String
    var notes: String?
    var lines: [Line]
}

/// Pick two locations and the items to move.
struct InventoryNewTransferSheet: View {
    let onCreated: () -> Void

    private struct Line: Identifiable {
        let id = UUID()
        var item = ""
        var quantity = 1
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var lookup = InventoryLookup()
    @State private var from = ""
    @State private var to = ""
    @State private var lines = [Line()]
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    private var validLines: [Line] { lines.filter { !$0.item.isEmpty && $0.quantity > 0 } }
    private var canSave: Bool { !from.isEmpty && !to.isEmpty && from != to && !validLines.isEmpty }

    var body: some View {
        OperationsFormSheet(title: "New transfer", confirm: "Create", canSave: canSave, saving: saving, error: error ?? (from == to && !from.isEmpty ? "Pick two different locations." : nil), onSave: save) {
            CardStack {
                OperationsPickerRow(label: "From", selection: $from, options: [("", "Choose")] + locations)
                OperationsPickerRow(label: "To", selection: $to, options: [("", "Choose")] + locations)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Items", action: ("Add item", { withAnimation(.snappy) { lines.append(Line()) } }))
                CardStack {
                    ForEach($lines) { $line in
                        HStack(spacing: 10) {
                            Picker("Item", selection: $line.item) {
                                Text(lookup.items.isEmpty ? "Loading…" : "Choose item").tag("")
                                ForEach(lookup.items.compactMap(\.recordID), id: \.self) { id in
                                    Text(lookup.itemName(id)).tag(id)
                                }
                            }
                            .labelsHidden()
                            .tint(line.item.isEmpty ? DTheme.inkSecondary : DTheme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Stepper(value: $line.quantity, in: 1 ... 100_000) {
                                Text(line.quantity.formatted()).font(DFont.figure(16, weight: .semibold)).foregroundStyle(DTheme.ink)
                            }
                            .fixedSize()
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 54)
                    }
                }
            }
            CardStack {
                FieldRow(label: "Notes") { TextField("Optional", text: $notes) }
            }
        }
        .presentationDetents([.large])
        .task {
            await lookup.loadWarehouses(env.api)
            await lookup.loadItems(env.api)
            if from.isEmpty { from = lookup.warehouses.first { $0["isDefault"]?.boolValue == true }?.recordID ?? "" }
        }
    }

    private var locations: [(value: String, label: String)] {
        lookup.warehouses.compactMap { warehouse in warehouse.recordID.map { ($0, warehouse["name"]?.stringValue ?? "Location") } }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let body = InventoryTransferBody(
            fromWarehouseId: from,
            toWarehouseId: to,
            notes: OperationsFormat.trimmed(notes),
            lines: validLines.map { .init(inventoryItemId: $0.item, quantity: $0.quantity) }
        )
        do {
            let _: JSONValue = try await env.api.post("inventory/transfers", body: body)
            env.toast.show("Transfer created")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Stocktakes

/// Counting a stocktake on the phone: every line with what the books expect
/// and a field for what's on the shelf. Counts save as you go; "Apply"
/// books the differences.
struct InventoryStockTakeView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var take: JSONValue?
    @State private var error: String?
    @State private var counts: [String: String] = [:]
    @State private var filter = "all"
    @State private var search = ""
    @State private var working: String?
    @State private var confirm: String?
    @FocusState private var focused: String?

    private var status: String { take?["status"]?.stringValue ?? "draft" }
    private var counting: Bool { status == "in_progress" }

    private var lines: [JSONValue] {
        let all = (take?.opsArray("lines") ?? []).sorted { ($0["inventoryItem.name"]?.stringValue ?? "") < ($1["inventoryItem.name"]?.stringValue ?? "") }
        let term = search.trimmingCharacters(in: .whitespaces)
        return all.filter { line in
            switch filter {
            case "todo": if line["countedQuantity"]?.intValue != nil { return false }
            case "diff": if (line["discrepancy"]?.intValue ?? 0) == 0 { return false }
            default: break
            }
            guard !term.isEmpty else { return true }
            return ["inventoryItem.name", "inventoryItem.code"].contains { line[$0]?.stringValue?.localizedCaseInsensitiveContains(term) == true }
        }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle(take?["name"]?.stringValue ?? "Stocktake")
            .navigationSubtitle(take.map { _ in RecordFormat.statusLabel(status) } ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Find an item")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if status == "draft" {
                            Button(role: .destructive) { confirm = "delete" } label: { Label("Delete stocktake", systemImage: "trash") }
                        }
                        if status == "draft" || status == "in_progress" {
                            Button(role: .destructive) { confirm = "cancel" } label: { Label("Cancel stocktake", systemImage: "xmark.circle") }
                        }
                        Button {
                            env.router.askTilly("Summarise the differences in the stocktake \(take?["name"]?.stringValue ?? "").", page: "inventory")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("More actions")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focused = nil }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if take != nil, status == "draft" || counting {
                    PurchasesActionBar {
                        Button { Task { await primary() } } label: {
                            HStack(spacing: 8) {
                                if working != nil { ProgressView().controlSize(.small).tint(DTheme.inkInverse) } else { Image(systemName: counting ? "checkmark.seal" : "play.fill") }
                                Text(counting ? "Apply counts" : "Start counting")
                            }
                        }
                        .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                        .disabled(working != nil)
                    }
                }
            }
            .confirmationDialog(confirmTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
                switch confirm {
                case "apply": Button("Apply counts") { Task { await apply() } }
                case "delete": Button("Delete", role: .destructive) { Task { await delete() } }
                default: Button("Cancel stocktake", role: .destructive) { Task { await setStatus("cancelled") } }
                }
                Button("Not now", role: .cancel) {}
            } message: {
                if confirm == "apply" { Text("Stock and your books are adjusted for every counted line that differs.") }
            }
            .onChange(of: focused) { old, _ in
                if let old { Task { await saveCount(old) } }
            }
            .task { await load() }
            .refreshable { await load() }
    }

    private var confirmTitle: String {
        switch confirm {
        case "apply": "Apply these counts?"
        case "delete": "Delete this stocktake?"
        default: "Cancel this stocktake?"
        }
    }

    @ViewBuilder
    private var content: some View {
        if let take {
            let all = take.opsArray("lines")
            let counted = all.filter { $0["countedQuantity"]?.intValue != nil }.count
            let differences = all.filter { ($0["discrepancy"]?.intValue ?? 0) != 0 }.count
            List {
                VStack(alignment: .leading, spacing: 14) {
                    LedgerTotals(items: [
                        .init(label: "Counted", value: "\(counted)/\(all.count)", detail: take["warehouse.name"]?.stringValue ?? "All locations", tint: DTheme.info),
                        .init(label: "Differences", value: "\(differences)", detail: "Counted vs expected", tint: differences > 0 ? DTheme.warning : DTheme.positive),
                    ])
                    OperationsBar(fraction: all.isEmpty ? 0 : Double(counted) / Double(all.count), tone: .info)
                    ChipRow(options: [
                        (value: "all", label: "All", count: nil),
                        (value: "todo", label: "To count", count: all.count - counted),
                        (value: "diff", label: "Differences", count: differences),
                    ], selection: $filter)
                    .padding(.horizontal, -16)
                }
                .padding(.vertical, 14)
                .ledgerRow()
                if status == "draft" {
                    Text("Start counting to enter what's on the shelf.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .ledgerRow()
                        .padding(.vertical, 8)
                }
                ForEach(lines, id: \.recordID) { line in
                    lineRow(line).ledgerRow()
                }
                LedgerEndMarker(text: "\(lines.count) \(lines.count == 1 ? "item" : "items")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
        } else if let error {
            ErrorStateView(message: error) { await load() }.frame(maxHeight: .infinity)
        } else {
            ScrollView { SkeletonRows(rows: 8, avatar: false) }
        }
    }

    private func lineRow(_ line: JSONValue) -> some View {
        let lineId = line.recordID ?? ""
        let expected = line["expectedQuantity"]?.intValue ?? 0
        let difference = line["discrepancy"]?.intValue
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(line["inventoryItem.name"]?.stringValue ?? "Item")
                    .font(.system(size: 15.5, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let code = line["inventoryItem.code"]?.stringValue {
                        Text(code).font(.system(size: 12.5, weight: .medium, design: .monospaced)).foregroundStyle(DTheme.inkTertiary)
                    }
                    Text("Expected \(expected.formatted())").font(.system(size: 13)).foregroundStyle(DTheme.inkSecondary)
                    if let difference, difference != 0 {
                        Text(difference > 0 ? "+\(difference)" : "\(difference)")
                            .font(DFont.figure(13, weight: .semibold))
                            .foregroundStyle(difference > 0 ? DTheme.positive : DTheme.negative)
                    }
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if counting {
                TextField("–", text: Binding(
                    get: { counts[lineId] ?? line["countedQuantity"]?.intValue.map(String.init) ?? "" },
                    set: { counts[lineId] = $0.filter(\.isNumber) }
                ))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(DFont.figure(17, weight: .semibold))
                .foregroundStyle(DTheme.ink)
                .frame(width: 68, height: 40)
                .background(DTheme.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .focused($focused, equals: lineId)
            } else if let counted = line["countedQuantity"]?.intValue {
                Text(counted.formatted())
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
            }
        }
        .padding(.vertical, 11)
    }

    // MARK: Actions

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("stock-takes/\(id)")
            withAnimation(.snappy) {
                take = response["stockTake"] ?? response
                error = nil
            }
        } catch {
            if take == nil { self.error = error.localizedDescription }
        }
    }

    /// Saves one line's count when its field loses focus.
    private func saveCount(_ lineId: String) async {
        guard let text = counts[lineId], let value = Int(text), let take else { return }
        guard let line = take.opsArray("lines").first(where: { $0.recordID == lineId }), line["countedQuantity"]?.intValue != value else { return }
        let expected = line["expectedQuantity"]?.intValue ?? 0
        let updated = line.opsSetting("countedQuantity", .number(Double(value))).opsSetting("discrepancy", .number(Double(value - expected)))
        withAnimation(.snappy) {
            self.take = take.opsSetting("lines", .array(take.opsArray("lines").map { $0.recordID == lineId ? updated : $0 }))
        }
        do {
            let _: JSONValue = try await env.api.patch("stock-takes/\(id)/lines/\(lineId)", body: ["countedQuantity": value])
        } catch {
            env.toast.error(error)
        }
    }

    private func primary() async {
        if counting {
            focused = nil
            confirm = "apply"
        } else {
            await setStatus("in_progress")
        }
    }

    private func setStatus(_ status: String) async {
        working = status
        defer { working = nil }
        do {
            let _: JSONValue = try await env.api.patch("stock-takes/\(id)", body: InventoryStatusBody(status: status))
            env.toast.show(status == "in_progress" ? "Counting started" : "Stocktake cancelled")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-stock-takes")
            if OperationsFormat.isDemo, let take { self.take = take.opsSetting("status", .string(status)) } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }

    private func apply() async {
        working = "apply"
        defer { working = nil }
        do {
            let response: JSONValue = try await env.api.post("stock-takes/\(id)/apply")
            let adjusted = response["adjustedCount"]?.intValue ?? 0
            env.toast.show("Applied · \(adjusted) \(adjusted == 1 ? "item" : "items") adjusted")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-stock-takes")
            if OperationsFormat.isDemo, let take { self.take = take.opsSetting("status", .string("completed")) } else { await load() }
        } catch {
            env.toast.error(error)
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("stock-takes/\(id)")
            env.toast.show("Stocktake deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-stock-takes")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

struct InventoryStockTakeBody: Encodable, Sendable {
    var name: String
    var warehouseId: String?
    var notes: String?
}

/// A new stocktake. Lines are created for every active item.
struct InventoryNewStockTakeSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var lookup = InventoryLookup()
    @State private var name = "Stocktake \(Date.now.formatted(.dateTime.month(.abbreviated).year()))"
    @State private var warehouse = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "New stocktake", confirm: "Create", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("Name", text: $name) }
                OperationsPickerRow(label: "Location", selection: $warehouse, options: [("", "All stock")] + lookup.warehouses.compactMap { item in
                    item.recordID.map { ($0, item["name"]?.stringValue ?? "Location") }
                })
                FieldRow(label: "Notes") { TextField("Optional", text: $notes) }
            }
            Text("Every active item gets a line with the quantity the books expect.")
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkTertiary)
                .padding(.horizontal, 4)
        }
        .presentationDetents([.medium, .large])
        .task { await lookup.loadWarehouses(env.api) }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            // notes isn't nullable on the server: leave it out when empty.
            let body = InventoryStockTakeBody(
                name: name.trimmingCharacters(in: .whitespaces),
                warehouseId: warehouse.isEmpty ? nil : warehouse,
                notes: OperationsFormat.trimmed(notes)
            )
            let _: JSONValue = try await env.api.post("stock-takes", body: body)
            env.toast.show("Stocktake created")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
