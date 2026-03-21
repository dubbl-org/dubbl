import SwiftUI

struct InvoiceDetailView: View {
    let invoiceId: String
    @State private var invoice: Invoice?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showActionSheet = false
    @Environment(\.dismiss) private var dismiss

    private let service = InvoiceService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error = error {
                    ErrorView(message: error) { Task { await load() } }
                } else if let invoice = invoice {
                    ScrollView {
                        VStack(spacing: 20) {
                            // Header
                            VStack(spacing: 8) {
                                if let status = invoice.status {
                                    StatusBadge(invoiceStatus: status)
                                }
                                Text(invoice.invoiceNumber ?? "Invoice")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                CurrencyText(invoice.total, currency: invoice.currencyCode, style: .title, weight: .bold)
                            }
                            .frame(maxWidth: .infinity)
                            .dubblCard()

                            // Details
                            VStack(spacing: 12) {
                                if let contact = invoice.contact {
                                    DetailRow(label: "Customer", value: contact.name)
                                }
                                DetailRow(label: "Issue Date", value: invoice.issueDate ?? "-")
                                DetailRow(label: "Due Date", value: invoice.dueDate ?? "-")
                                if let reference = invoice.reference {
                                    DetailRow(label: "Reference", value: reference)
                                }
                                DetailRow(label: "Subtotal", value: (invoice.subtotal ?? 0).asCurrency(code: invoice.currencyCode ?? "USD"))
                                DetailRow(label: "Tax", value: (invoice.taxTotal ?? 0).asCurrency(code: invoice.currencyCode ?? "USD"))
                                DetailRow(label: "Total", value: (invoice.total ?? 0).asCurrency(code: invoice.currencyCode ?? "USD"))
                                if let paid = invoice.amountPaid, paid > 0 {
                                    DetailRow(label: "Paid", value: paid.asCurrency(code: invoice.currencyCode ?? "USD"))
                                }
                                if let due = invoice.amountDue, due > 0 {
                                    DetailRow(label: "Amount Due", value: due.asCurrency(code: invoice.currencyCode ?? "USD"))
                                }
                            }
                            .dubblCard()

                            // Line Items
                            if let lines = invoice.lines, !lines.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Line Items")
                                        .font(.headline)
                                    ForEach(lines) { line in
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(line.description ?? "Item")
                                                    .font(.subheadline)
                                                Text("Qty: \(line.quantity?.asQuantity() ?? "1") × \((line.unitPrice ?? 0).asCurrency())")
                                                    .font(.caption)
                                                    .foregroundColor(.dubblMuted)
                                            }
                                            Spacer()
                                            Text((line.amount ?? 0).asCurrency())
                                                .font(.subheadline)
                                                .fontWeight(.medium)
                                        }
                                        Divider()
                                    }
                                }
                                .dubblCard()
                            }

                            // Notes
                            if let notes = invoice.notes, !notes.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Notes")
                                        .font(.headline)
                                    Text(notes)
                                        .font(.subheadline)
                                        .foregroundColor(.dubblMuted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                            }

                            // Actions
                            if invoice.status != .paid && invoice.status != .void {
                                VStack(spacing: 12) {
                                    if invoice.status == .draft {
                                        Button("Send Invoice") {
                                            Task {
                                                try? await service.send(id: invoiceId)
                                                await load()
                                            }
                                        }
                                        .buttonStyle(DubblButtonStyle())
                                    }

                                    Button("Mark as Paid") {
                                        Task {
                                            try? await service.markPaid(id: invoiceId)
                                            await load()
                                        }
                                    }
                                    .buttonStyle(DubblButtonStyle(isPrimary: invoice.status != .draft))

                                    Button("Void Invoice") {
                                        Task {
                                            try? await service.void(id: invoiceId)
                                            await load()
                                        }
                                    }
                                    .buttonStyle(DubblButtonStyle(isPrimary: false, isDestructive: true))
                                }
                                .padding(.top, 8)
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
                    Button("Close") { dismiss() }
                        .foregroundColor(.dubblPrimary)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        do {
            invoice = try await service.get(id: invoiceId)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}
