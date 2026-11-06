import SwiftUI

/// One delivery: what came in against which order, valued at the order's
/// cost, with a button to bill it. Lines carry `quantityReceived` (×100) and
/// `unitCost` (minor units), so the value is worked out here.
struct PurchasingGoodsReceiptDetail: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var receipt: JSONValue?
    @State private var failed: String?
    @State private var working = false
    @State private var confirming = false
    @State private var bill: (id: String, number: String)?

    private var currency: String { receipt?["purchaseOrder.currencyCode"]?.stringValue ?? env.session.currency }
    private var status: String { receipt?["status"]?.stringValue ?? "received" }
    private var lines: [JSONValue] { receipt?["lines"]?.arrayValue ?? [] }
    private var total: Int { lines.reduce(0) { $0 + Self.value($1) } }

    static func value(_ line: JSONValue) -> Int {
        Int((Double(line["quantityReceived"]?.intValue ?? 0) / 100 * Double(line["unitCost"]?.intValue ?? 0)).rounded())
    }

    var body: some View {
        ScrollView {
            if let receipt {
                VStack(alignment: .leading, spacing: 24) {
                    hero(receipt)
                    if !lines.isEmpty { linesSection }
                    details(receipt)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "received" ? 110 : 28)
            } else if let failed {
                ErrorStateView(message: failed) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Goods receipt")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Ask Tilly", systemImage: "sparkle") {
                    env.router.askTilly("Tell me about goods receipt \(receipt?["receiptNumber"]?.stringValue ?? "") from \(receipt?["contact.name"]?.stringValue ?? "a supplier").", page: "goods-receipts")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if receipt != nil, status == "received", bill == nil {
                PurchasesActionBar {
                    Button { confirming = true } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "doc.text") }
                            Text("Create bill")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(working)
                }
            }
        }
        .confirmationDialog("Create a draft bill for what was received?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Create bill") { Task { await createBill() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ receipt: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let number = receipt["receiptNumber"]?.stringValue {
                    Text(number)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                LedgerStatus(text: RecordFormat.statusLabel(bill == nil ? status : "billed"), tone: RecordFormat.tone(bill == nil ? status : "billed", spec: PurchasingCatalog.goodsReceipts))
            }
            Text(receipt["contact.name"]?.stringValue ?? "Goods receipt")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(total, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("Received \(DubblDate.display(receipt["date"]?.stringValue)) · \(lines.count) \(lines.count == 1 ? "line" : "lines")")
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private var linesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Received · \(lines.count)")
            CardStack {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    let quantity = Double(line["quantityReceived"]?.intValue ?? 0) / 100
                    let ordered = line["purchaseOrderLine.quantity"]?.intValue.map { Double($0) / 100 }
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(line["description"]?.stringValue ?? "Item")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                                .lineLimit(2)
                            Text([
                                "\(PurchasingReceiveSheet.units(quantity)) × \(Money.format(line["unitCost"]?.intValue ?? 0, currency: currency))",
                                ordered.map { "of \(PurchasingReceiveSheet.units($0)) ordered" },
                                line["warehouse.name"]?.stringValue,
                            ].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Text(Money.format(Self.value(line), currency: currency))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private func details(_ receipt: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                if let orderID = receipt["purchaseOrderId"]?.stringValue {
                    NavigationLink(value: RecordRoute(spec: "purchase-orders", id: orderID)) {
                        linkRow("Purchase order", receipt["purchaseOrder.poNumber"]?.stringValue ?? "Open")
                    }
                    .buttonStyle(RowPressStyle())
                }
                if let bill {
                    NavigationLink { BillDetailView(id: bill.id) } label: { linkRow("Bill", bill.number) }
                        .buttonStyle(RowPressStyle())
                }
                DetailRow("Received", DubblDate.display(receipt["date"]?.stringValue))
                if let notes = receipt["notes"]?.stringValue, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notes")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(notes)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private func linkRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(DTheme.inkSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 15, design: .monospaced))
                .foregroundStyle(DTheme.ink)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("goods-receipts/\(id)")
            withAnimation(.snappy) {
                receipt = RecordDetailView.record(in: response, key: "goodsReceipt")
                failed = nil
            }
        } catch {
            if receipt == nil { failed = error.localizedDescription }
        }
    }

    /// `POST goods-receipts/{id}/create-bill` -> `{ bill }` as a draft.
    private func createBill() async {
        working = true
        defer { working = false }
        do {
            let response: JSONValue = try await env.api.post("goods-receipts/\(id)/create-bill", body: [String: JSONValue]())
            let number = response["bill.billNumber"]?.stringValue ?? "Bill"
            env.toast.show("Draft \(number) created")
            NotificationCenter.default.post(name: .recordsChanged, object: "goods-receipts")
            if let billID = response["bill.id"]?.stringValue {
                withAnimation(.snappy) { bill = (billID, number) }
            }
            #if DEBUG
            if DemoData.isEnabled { return }
            #endif
            await load()
        } catch {
            env.toast.error(error)
        }
    }
}
