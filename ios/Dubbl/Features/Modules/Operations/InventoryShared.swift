import SwiftUI

// Inventory pieces shared across items, locations, transfers and stocktakes.
// Quantities are whole units (not ×100); prices and values are minor units.
// BOM component quantities and wastage come back as decimal strings.

enum Inventory {
    /// "low", "out" or nil for an active item's stock level.
    static func level(_ item: JSONValue) -> String? {
        guard item["isActive"]?.boolValue != false else { return nil }
        let quantity = item["quantityOnHand"]?.intValue ?? 0
        if quantity <= 0 { return "out" }
        let reorder = item["reorderPoint"]?.intValue ?? 0
        return reorder > 0 && quantity <= reorder ? "low" : nil
    }

    static func levelLabel(_ level: String?) -> (String, Tone)? {
        switch level {
        case "out": ("Out of stock", .negative)
        case "low": ("Low stock", .warning)
        default: nil
        }
    }

    static let movementLabels: [String: String] = [
        "adjustment": "Adjustment", "transfer_in": "Transfer in", "transfer_out": "Transfer out", "stock_take": "Stocktake",
        "purchase": "Purchase", "sale": "Sale", "initial": "Opening stock",
    ]

    static let referenceLabels: [String: String] = [
        "opening_balance": "Opening balance", "write_down": "Write-down", "revaluation": "Revaluation",
        "assembly_order": "Assembly", "goods_receipt": "Goods received", "bill": "Bill", "bill_void": "Bill voided",
        "sale_reversal": "Sale reversed", "purchase_price_variance": "Price variance",
    ]

    /// "Low stock" style title for a movement.
    static func movementTitle(_ movement: JSONValue) -> String {
        if let reference = movement["referenceType"]?.stringValue, let label = referenceLabels[reference] { return label }
        let type = movement["type"]?.stringValue ?? "adjustment"
        return movementLabels[type] ?? type.humanized
    }

    /// Margin of sale over cost, as a whole percent.
    static func margin(sale: Int, cost: Int) -> String? {
        guard sale > 0 else { return nil }
        return "\(Int((Double(sale - cost) / Double(sale) * 100).rounded()))%"
    }

    static func units(_ quantity: Int) -> String {
        "\(quantity.formatted()) \(abs(quantity) == 1 ? "unit" : "units")"
    }
}

// MARK: - Bodies

/// POST inventory/{id}/adjust: a signed change in whole units.
struct InventoryAdjustBody: Encodable, Sendable {
    var adjustmentType = "quantity"
    var adjustment: Int
    var reason: String
}

struct InventoryItemBody: Encodable, Sendable {
    var code: String
    var name: String
    var description: String?
    var categoryId: String?
    var sku: String?
    var purchasePrice: Int
    var salePrice: Int
    var quantityOnHand: Int
    var reorderPoint: Int
}

struct InventoryItemEditBody: Encodable, Sendable {
    var name: String
    var description: String?
    var sku: String?
    var purchasePrice: Int
    var salePrice: Int
    var reorderPoint: Int
}

struct InventoryActiveBody: Encodable, Sendable {
    var isActive: Bool
}

struct InventoryStatusBody: Encodable, Sendable {
    var status: String
}

// MARK: - Pickers

/// Items and locations for pickers, loaded once per sheet.
@MainActor @Observable
final class InventoryLookup {
    private(set) var items: [JSONValue] = []
    private(set) var warehouses: [JSONValue] = []

    func loadItems(_ api: APIClient) async {
        guard items.isEmpty else { return }
        if let response: JSONValue = try? await api.get("inventory", query: ["limit": "100", "status": "active", "sortBy": "name", "sortOrder": "asc"]) {
            items = response.opsArray("data")
        }
    }

    func loadWarehouses(_ api: APIClient) async {
        guard warehouses.isEmpty else { return }
        if let response: JSONValue = try? await api.get("warehouses") {
            warehouses = response.opsArray("data").filter { $0["isActive"]?.boolValue != false }
        }
    }

    func item(_ id: String?) -> JSONValue? {
        items.first { $0.recordID == id }
    }

    func itemName(_ id: String?) -> String {
        item(id)?["name"]?.stringValue ?? "Item"
    }
}

// MARK: - Adjust stock

/// Add, remove or set the count of an item, with a reason that goes on the
/// journal entry. Quick reasons cover the usual cases.
struct InventoryAdjustSheet: View {
    let item: JSONValue
    var onDone: () -> Void = {}

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "add"
    @State private var amount = 1
    @State private var amountText = "1"
    @State private var reason = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var onHand: Int { item["quantityOnHand"]?.intValue ?? 0 }

    /// The signed change the API takes.
    private var delta: Int {
        switch mode {
        case "remove": -amount
        case "set": amount - onHand
        default: amount
        }
    }

    private var result: Int { onHand + delta }
    private var reasons: [String] {
        switch mode {
        case "remove": ["Damaged", "Lost", "Used internally", "Sample", "Expired"]
        case "set": ["Stock count", "Correction"]
        default: ["Received", "Returned", "Found in count", "Correction"]
        }
    }

    var body: some View {
        OperationsFormSheet(
            title: "Adjust stock",
            confirm: "Adjust",
            canSave: delta != 0 && result >= 0 && OperationsFormat.trimmed(reason) != nil,
            saving: saving,
            error: error ?? (result < 0 ? "You can't remove more than the \(Inventory.units(onHand)) on hand." : nil),
            onSave: save
        ) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item["name"]?.stringValue ?? "Item")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(onHand.formatted())
                        .foregroundStyle(DTheme.inkTertiary)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                    Text(result.formatted())
                        .foregroundStyle(result < 0 ? DTheme.negative : DTheme.ink)
                        .contentTransition(.numericText(value: Double(result)))
                    Text("on hand")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .animation(.snappy, value: result)
            }
            .padding(.horizontal, 4)

            OperationsSegment(selection: $mode, options: [("add", "Add"), ("remove", "Remove"), ("set", "Set count")])

            CardStack {
                HStack(spacing: 12) {
                    Text(mode == "set" ? "Counted" : "Units")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.ink)
                    Spacer()
                    Button { step(-1) } label: { Image(systemName: "minus") }
                        .buttonStyle(SoftButtonStyle(size: .small))
                        .accessibilityLabel("Fewer")
                    TextField("0", text: $amountText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(DFont.figure(20, weight: .semibold))
                        .frame(width: 72)
                        .focused($focused)
                    Button { step(1) } label: { Image(systemName: "plus") }
                        .buttonStyle(SoftButtonStyle(size: .small))
                        .accessibilityLabel("More")
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 60)
            }

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Reason")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(reasons, id: \.self) { option in
                            let selected = reason == option
                            Button { reason = option } label: {
                                Text(option)
                                    .font(.system(size: 13.5, weight: .medium))
                                    .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                                    .padding(.horizontal, 12)
                                    .frame(height: 32)
                                    .background(selected ? DTheme.tintStrong : DTheme.card, in: Capsule())
                                    .overlay(Capsule().strokeBorder(selected ? .clear : DTheme.hairline, lineWidth: 0.5))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                CardStack {
                    FieldRow(label: "Note") {
                        TextField("Why the count changed", text: $reason)
                    }
                }
            }
        }
        .presentationDetents([.large])
        .onChange(of: amountText) { _, text in
            let digits = text.filter(\.isNumber)
            if digits != text { amountText = digits }
            amount = Int(digits) ?? 0
        }
        .onChange(of: mode) { _, value in
            setAmount(value == "set" ? onHand : 1)
            if !reasons.contains(reason) { reason = "" }
        }
    }

    private func step(_ by: Int) {
        setAmount(max(0, amount + by))
    }

    private func setAmount(_ value: Int) {
        amount = value
        amountText = "\(value)"
    }

    private func save() async {
        guard let id = item.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = InventoryAdjustBody(adjustment: delta, reason: reason.trimmingCharacters(in: .whitespaces))
            let _: JSONValue = try await env.api.post("inventory/\(id)/adjust", body: body)
            env.toast.show("Stock now \(result.formatted())")
            NotificationCenter.default.post(name: .recordsChanged, object: "inventory-items")
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A quantity in a row: big figure, "on hand", stock level under it.
struct InventoryQuantity: View {
    let item: JSONValue

    @Environment(AppEnvironment.self) private var env

    var body: some View {
        let level = Inventory.level(item)
        VStack(alignment: .trailing, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text((item["quantityOnHand"]?.intValue ?? 0).formatted())
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(level == "out" ? DTheme.negative : DTheme.ink)
                Text(item["unitOfMeasure"]?.stringValue ?? "on hand")
                    .font(.system(size: 12))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            if let (label, tone) = Inventory.levelLabel(level) {
                LedgerStatus(text: label, tone: tone)
            } else if item["isActive"]?.boolValue == false {
                LedgerStatus(text: "Inactive", tone: .neutral)
            } else if let price = item["salePrice"]?.intValue, price > 0 {
                Text(Money.format(price, currency: env.session.currency))
                    .font(.system(size: 12.5))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .fixedSize()
    }
}
