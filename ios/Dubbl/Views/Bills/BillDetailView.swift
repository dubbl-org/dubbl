import SwiftUI

struct BillDetailView: View {
    let billId: String
    @State private var bill: Bill?
    @State private var isLoading = true
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    private let service = BillService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error = error {
                    ErrorView(message: error) { Task { await load() } }
                } else if let bill = bill {
                    ScrollView {
                        VStack(spacing: 20) {
                            VStack(spacing: 8) {
                                if let status = bill.status {
                                    StatusBadge(billStatus: status)
                                }
                                Text(bill.billNumber ?? "Bill")
                                    .font(.title2).fontWeight(.bold)
                                CurrencyText(bill.total, currency: bill.currencyCode, style: .title, weight: .bold)
                            }
                            .frame(maxWidth: .infinity)
                            .dubblCard()

                            VStack(spacing: 12) {
                                if let contact = bill.contact {
                                    DetailRow(label: "Supplier", value: contact.name)
                                }
                                DetailRow(label: "Issue Date", value: bill.issueDate ?? "-")
                                DetailRow(label: "Due Date", value: bill.dueDate ?? "-")
                                DetailRow(label: "Subtotal", value: (bill.subtotal ?? 0).asCurrency())
                                DetailRow(label: "Tax", value: (bill.taxTotal ?? 0).asCurrency())
                                DetailRow(label: "Total", value: (bill.total ?? 0).asCurrency())
                                if let paid = bill.amountPaid, paid > 0 {
                                    DetailRow(label: "Paid", value: paid.asCurrency())
                                }
                            }
                            .dubblCard()

                            if let lines = bill.lines, !lines.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Line Items").font(.headline)
                                    ForEach(lines) { line in
                                        HStack {
                                            VStack(alignment: .leading) {
                                                Text(line.description ?? "Item").font(.subheadline)
                                                Text("Qty: \(line.quantity?.asQuantity() ?? "1") × \((line.unitPrice ?? 0).asCurrency())")
                                                    .font(.caption).foregroundColor(.dubblMuted)
                                            }
                                            Spacer()
                                            Text((line.amount ?? 0).asCurrency()).font(.subheadline).fontWeight(.medium)
                                        }
                                        Divider()
                                    }
                                }
                                .dubblCard()
                            }

                            // Actions
                            if bill.status == .pendingApproval {
                                Button("Approve Bill") {
                                    Task { try? await service.approve(id: billId); await load() }
                                }
                                .buttonStyle(DubblButtonStyle())
                            }
                            if bill.status != .paid && bill.status != .void {
                                Button("Mark as Paid") {
                                    Task { try? await service.markPaid(id: billId); await load() }
                                }
                                .buttonStyle(DubblButtonStyle(isPrimary: bill.status != .pendingApproval))
                            }

                            Spacer(minLength: 40)
                        }
                        .padding()
                    }
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }.foregroundColor(.dubblPrimary)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        do { bill = try await service.get(id: billId) } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}
