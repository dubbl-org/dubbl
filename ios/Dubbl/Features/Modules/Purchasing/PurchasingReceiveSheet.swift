import SwiftUI

/// Receives goods against a purchase order: how many of each line arrived.
/// `POST goods-receipts { purchaseOrderId, date, notes, lines: [{ purchaseOrderLineId, quantity }] }`
/// with whole-unit quantities; the server books stock and moves the order to
/// partial or received.
struct PurchasingReceiveSheet: View {
    let orderID: String
    let done: () -> Void

    /// A line still waiting on stock. Quantities are whole units.
    private struct Line: Identifiable {
        let id: String
        let description: String
        let ordered: Double
        let received: Double
        var now: String

        var outstanding: Double { max(0, ordered - received) }
        var nowValue: Double { SalesDecimal.parse(now).map(SalesDecimal.double) ?? 0 }
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var number: String?
    @State private var supplier: String?
    @State private var lines: [Line] = []
    @State private var loaded = false
    @State private var failed: String?
    @State private var date = Calendar.current.startOfDay(for: .now)
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    private var receiving: [Line] { lines.filter { $0.nowValue > 0 } }
    private var tooMany: Bool { lines.contains { $0.nowValue > $0.outstanding + 0.0001 } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let number {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(number)
                                .font(.system(size: 13, weight: .medium, design: .monospaced))
                                .foregroundStyle(DTheme.inkTertiary)
                            Text(supplier ?? "Purchase order")
                                .font(.system(size: 22, weight: .semibold))
                                .tracking(-0.4)
                                .foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 4)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("What arrived", action: allAction)
                        if !loaded {
                            SkeletonRows(rows: 3, avatar: false)
                                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        } else if let failed {
                            ErrorStateView(message: failed) { await load() }
                        } else if lines.isEmpty {
                            Text("Everything on this order has been received.")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.inkSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(16)
                                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        } else {
                            CardStack {
                                ForEach($lines) { $line in
                                    row($line)
                                }
                            }
                        }
                    }

                    CardStack {
                        SalesInlineRow(label: "Received on") {
                            DatePicker("Received on", selection: $date, displayedComponents: .date)
                                .labelsHidden()
                        }
                        FieldRow(label: "Notes") {
                            TextField("Delivery note, damage, anything to remember", text: $notes, axis: .vertical)
                                .lineLimit(1 ... 4)
                        }
                    }

                    if let message = error ?? (tooMany ? "That's more than is still to come on one of the lines." : nil) {
                        Label(message, systemImage: "exclamationmark.circle")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("Receive goods")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                        .disabled(saving)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView().tint(DTheme.inkInverse) } else { Text(receiving.isEmpty ? "Receive" : "Receive \(receiving.count) \(receiving.count == 1 ? "line" : "lines")") }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(saving || receiving.isEmpty || tooMany)
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 6)
                .background { SalesBottomFade() }
            }
            .task { await load() }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
        .interactiveDismissDisabled(saving)
    }

    private func row(_ line: Binding<Line>) -> some View {
        let value = line.wrappedValue
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(value.description)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                Text("\(Self.units(value.received)) of \(Self.units(value.ordered)) received")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            TextField("0", text: line.now)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(DFont.figure(16, weight: .regular))
                .foregroundStyle(value.nowValue > value.outstanding + 0.0001 ? DTheme.negative : DTheme.ink)
                .padding(.horizontal, 10)
                .frame(width: 76, height: 38)
                .background(DTheme.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    /// 2 -> "2", 2.5 -> "2.5"
    static func units(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
    }

    private var allAction: (title: String, run: () -> Void)? {
        if lines.isEmpty { return nil }
        return (title: "All of it", run: { fillAll() })
    }

    private func fillAll() {
        for index in lines.indices { lines[index].now = Self.units(lines[index].outstanding) }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("purchase-orders/\(orderID)")
            let order = RecordDetailView.record(in: response, key: "purchaseOrder")
            number = order["poNumber"]?.stringValue
            supplier = order["contact.name"]?.stringValue
            lines = (order["lines"]?.arrayValue ?? []).compactMap { item -> Line? in
                guard let id = item.recordID else { return nil }
                let ordered = Double(item["quantity"]?.intValue ?? 0) / 100
                let received = Double(item["quantityReceived"]?.intValue ?? 0) / 100
                guard ordered - received > 0 else { return nil }
                return Line(id: id, description: item["description"]?.stringValue ?? "Item", ordered: ordered, received: received, now: Self.units(ordered - received))
            }
            failed = nil
        } catch {
            failed = error.localizedDescription
        }
        withAnimation(.snappy) { loaded = true }
    }

    private func save() async {
        error = nil
        saving = true
        defer { saving = false }
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: JSONValue] = [
            "purchaseOrderId": .string(orderID),
            "date": .string(DubblDate.string(date)),
            "notes": trimmed.isEmpty ? .null : .string(trimmed),
            "lines": .array(receiving.map { .object(["purchaseOrderLineId": .string($0.id), "quantity": .number($0.nowValue)]) }),
        ]
        do {
            let response: JSONValue = try await env.api.post("goods-receipts", body: body)
            let receipt = response["goodsReceipt.receiptNumber"]?.stringValue
            env.toast.show(receipt.map { "Received, \($0) recorded" } ?? "Goods received", symbol: "shippingbox")
            NotificationCenter.default.post(name: .recordsChanged, object: "goods-receipts")
            done()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
