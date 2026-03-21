import Foundation

struct Invoice: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let invoiceNumber: String?
    let issueDate: String?
    let dueDate: String?
    let status: InvoiceStatus?
    let reference: String?
    let notes: String?
    let subtotal: Int?
    let taxTotal: Int?
    let total: Int?
    let amountPaid: Int?
    let amountDue: Int?
    let currencyCode: String?
    let paymentLinkToken: String?
    let sentAt: Date?
    let paidAt: Date?
    let voidedAt: Date?
    let createdAt: Date?
    let updatedAt: Date?
    let contact: Contact?
    let lines: [InvoiceLine]?
}

enum InvoiceStatus: String, Codable, CaseIterable {
    case draft, sent, partial, paid, overdue, void

    var displayName: String {
        rawValue.capitalized
    }

    var colorName: String {
        switch self {
        case .draft: return "gray"
        case .sent: return "blue"
        case .partial: return "orange"
        case .paid: return "green"
        case .overdue: return "red"
        case .void: return "gray"
        }
    }
}

struct InvoiceLine: Codable, Identifiable {
    let id: String
    let invoiceId: String?
    let description: String?
    let quantity: Int?
    let unitPrice: Int?
    let accountId: String?
    let taxRateId: String?
    let discountPercent: Int?
    let taxAmount: Int?
    let amount: Int?
    let sortOrder: Int?
}

struct InvoiceCreate: Encodable {
    var contactId: String
    var issueDate: String
    var dueDate: String
    var reference: String?
    var notes: String?
    var currencyCode: String?
    var lines: [InvoiceLineCreate]
}

struct InvoiceLineCreate: Encodable {
    var description: String
    var quantity: Int
    var unitPrice: Int
    var accountId: String?
    var taxRateId: String?
    var discountPercent: Int?
}
