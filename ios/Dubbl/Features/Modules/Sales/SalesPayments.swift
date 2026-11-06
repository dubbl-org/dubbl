import SwiftUI

/// One customer payment: how much, from whom, where it landed and which
/// invoices it settled. Allocations only carry document ids, so invoice
/// numbers come from the customer's invoices.
struct SalesPaymentDetail: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var payment: JSONValue?
    @State private var invoices: [String: Invoice] = [:]
    @State private var failed: String?
    @State private var confirmingDelete = false

    private var currency: String { payment?["currencyCode"]?.stringValue ?? env.session.currency }
    private var allocations: [JSONValue] { payment?["allocations"]?.arrayValue ?? [] }
    private var applied: Int { allocations.reduce(0) { $0 + ($1["amount"]?.intValue ?? 0) } }

    var body: some View {
        ScrollView {
            if let payment {
                VStack(alignment: .leading, spacing: 24) {
                    hero(payment)
                    if !allocations.isEmpty { appliedTo }
                    details(payment)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            } else if let failed {
                ErrorStateView(message: failed) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Payment")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Ask Tilly", systemImage: "sparkle") {
                        env.router.askTilly("Tell me about payment \(payment?["paymentNumber"]?.stringValue ?? "") from \(payment?["contact.name"]?.stringValue ?? "a customer").", page: "payments")
                    }
                    Button("Delete payment", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .confirmationDialog("Delete this payment? The invoices it paid become unpaid again.", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete payment", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ payment: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let number = payment["paymentNumber"]?.stringValue {
                    Text(number)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                LedgerStatus(text: "Received", tone: .positive)
            }
            Text(payment["contact.name"]?.stringValue ?? "Payment")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(payment["amount"]?.intValue ?? 0, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text([DubblDate.display(payment["date"]?.stringValue), payment["method"]?.stringValue.map(Self.method)].compactMap { $0 }.joined(separator: " · "))
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private var appliedTo: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Applied to · \(allocations.count)")
            CardStack {
                ForEach(Array(allocations.enumerated()), id: \.offset) { _, allocation in
                    let type = allocation["documentType"]?.stringValue ?? "invoice"
                    let documentID = allocation["documentId"]?.stringValue ?? ""
                    let invoice = type == "invoice" ? invoices[documentID] : nil
                    let row = HStack(spacing: 12) {
                        IconTile(symbol: type == "invoice" ? "doc.text" : "arrow.uturn.backward", size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(invoice?.invoiceNumber ?? type.replacingOccurrences(of: "_", with: " ").humanized)
                                .font(.system(size: 15, weight: .medium, design: invoice == nil ? .default : .monospaced))
                                .foregroundStyle(DTheme.ink)
                            if let invoice {
                                Text(invoice.status == "paid" ? "Paid in full" : "\(Money.format(invoice.amountDue, currency: invoice.currencyCode)) still due")
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        Spacer()
                        Text(Money.format(allocation["amount"]?.intValue ?? 0, currency: currency))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                        if invoice != nil {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())

                    if let invoice {
                        NavigationLink { InvoiceDetailView(id: invoice.id) } label: { row }
                            .buttonStyle(RowPressStyle())
                    } else {
                        row
                    }
                }
                let left = (payment?["amount"]?.intValue ?? 0) - applied
                if left > 0 {
                    DetailRow("Not applied yet", Money.format(left, currency: currency))
                }
            }
        }
    }

    private func details(_ payment: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                DetailRow("Date", DubblDate.display(payment["date"]?.stringValue))
                DetailRow("Method", Self.method(payment["method"]?.stringValue ?? "other"))
                if let account = payment["bankAccount.accountName"]?.stringValue {
                    DetailRow("Paid into", account)
                }
                if let reference = payment["reference"]?.stringValue, !reference.isEmpty {
                    DetailRow("Reference", reference)
                }
                if let notes = payment["notes"]?.stringValue, !notes.isEmpty {
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
                if let created = payment["createdAt"]?.stringValue {
                    DetailRow("Recorded", DubblDate.display(created))
                }
            }
        }
    }

    static func method(_ value: String) -> String {
        switch value {
        case "bank_transfer": "Bank transfer"
        default: value.replacingOccurrences(of: "_", with: " ").humanized
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payments/\(id)")
            let record = RecordDetailView.record(in: response, key: "payment")
            withAnimation(.snappy) {
                payment = record
                failed = nil
            }
            if let contactID = record["contactId"]?.stringValue,
               let page: Page<Invoice> = try? await env.api.get("invoices", query: ["contactId": contactID, "limit": "200"]) {
                withAnimation(.snappy) { invoices = Dictionary(page.data.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }) }
            }
        } catch {
            if payment == nil { failed = error.localizedDescription }
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("payments/\(id)")
            env.toast.show("Payment deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "sales-payments")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}
