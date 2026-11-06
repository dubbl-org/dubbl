import SwiftUI
import UIKit

// MARK: - Request and response shapes

/// POST invoices/{id}/pay. `amount` is integer minor units.
struct SalesPaymentBody: Encodable, Sendable {
    var amount: Int
    var date: String
    var method: String
    var reference: String?
}

/// POST invoices/{id}/pay answers the updated invoice and the new payment.
struct SalesPaymentResponse: Decodable, Sendable {
    var invoice: Invoice
    var payment: InvoicePayment?
}

/// POST invoices. Line quantity and unitPrice are decimals; unitPrice is in
/// MAJOR units (12.50), the server converts it to minor units and adds tax.
struct SalesNewInvoiceBody: Encodable, Sendable {
    struct Line: Encodable, Sendable {
        var description: String
        var quantity: Double
        var unitPrice: Double
    }

    var contactId: String
    var issueDate: String
    var dueDate: String
    var reference: String?
    var notes: String?
    var lines: [Line]
}

struct SalesPaymentLinkResponse: Decodable, Sendable {
    var token: String?
    var url: String
}

/// Posted after any invoice mutation so lists in any tab can refresh.
extension Notification.Name {
    static let salesInvoicesChanged = Notification.Name("dubbl.sales.invoicesChanged")
}

enum SalesEvents {
    @MainActor static func invoicesChanged() {
        NotificationCenter.default.post(name: .salesInvoicesChanged, object: nil)
    }
}

// MARK: - Presentation helpers

extension Invoice {
    /// Sent, part paid or overdue: money still to collect.
    var salesIsOpen: Bool { ["sent", "partial", "overdue"].contains(status) }

    /// What the list and hero lead with: the balance while open, the total otherwise.
    var salesHeadlineAmount: Int { salesIsOpen ? amountDue : total }

    var salesContactName: String { contact?.name ?? "No customer" }

    /// "Due in 5 days", "3 days overdue", "Paid 12 Oct", "Voided".
    var salesDueText: String {
        switch status {
        case "paid":
            if let paidAt { return "Paid \(DubblDate.short(paidAt))" }
            return "Paid"
        case "void": return "Voided"
        case "draft", "pending_approval", "rejected": return "Due \(DubblDate.short(dueDate))"
        default:
            guard let days = DubblDate.daysFromToday(dueDate) else { return "Due \(DubblDate.short(dueDate))" }
            switch days {
            case ..<(-1): return "\(-days) days overdue"
            case -1: return "1 day overdue"
            case 0: return "Due today"
            case 1: return "Due tomorrow"
            default: return "Due in \(days) days"
            }
        }
    }

    var salesIsLate: Bool {
        guard salesIsOpen, let days = DubblDate.daysFromToday(dueDate) else { return status == "overdue" }
        return days < 0
    }
}

/// A plain message error for local validation and odd responses.
struct SalesError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

// MARK: - PDF sharing

enum SalesPDF {
    /// Downloads the invoice PDF and writes it to a temp file named after the
    /// invoice, ready for the share sheet.
    static func file(for invoice: Invoice, api: APIClient) async throws -> URL {
        var data = try await api.download("invoices/\(invoice.id)/pdf", query: ["format": "pdf"])
        #if DEBUG
        if DemoData.isEnabled, data.isEmpty { data = demoPDF(invoice) }
        #endif
        guard !data.isEmpty else { throw SalesError("The PDF came back empty.") }
        let name = invoice.invoiceNumber.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appending(path: "\(name).pdf")
        try data.write(to: url, options: .atomic)
        return url
    }

    #if DEBUG
    private static func demoPDF(_ invoice: Invoice) -> Data {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        return renderer.pdfData { context in
            context.beginPage()
            let text = "\(invoice.invoiceNumber)\n\(invoice.salesContactName)\n\(Money.format(invoice.total, currency: invoice.currencyCode))"
            text.draw(at: CGPoint(x: 56, y: 72), withAttributes: [.font: UIFont.systemFont(ofSize: 22, weight: .semibold)])
        }
    }
    #endif
}

/// A file ready to share, presented with `.sheet(item:)`.
struct SalesSharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// The system share sheet for a downloaded PDF.
struct SalesShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: - Small form rows

/// "Label ........ control" inside a form card.
struct SalesInlineRow<Trailing: View>: View {
    let label: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.system(size: 16))
                .foregroundStyle(DTheme.ink)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }
}

/// Decimal text typed by the user: accepts "1,5" as well as "1.5".
enum SalesDecimal {
    static func parse(_ text: String) -> Decimal? {
        let trimmed = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !trimmed.isEmpty else { return nil }
        return Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX"))
    }

    static func double(_ value: Decimal) -> Double { NSDecimalNumber(decimal: value).doubleValue }
}

/// Solid shell behind a bottom action bar, fading into the content above.
struct SalesBottomFade: View {
    var body: some View {
        DTheme.shell
            .overlay(alignment: .top) {
                LinearGradient(colors: [DTheme.shell.opacity(0), DTheme.shell], startPoint: .top, endPoint: .bottom)
                    .frame(height: 24)
                    .offset(y: -24)
            }
            .ignoresSafeArea()
    }
}
