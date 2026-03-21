import Foundation

struct Payment: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let invoiceId: String?
    let billId: String?
    let paymentNumber: String?
    let paymentDate: String?
    let amount: Int?
    let currencyCode: String?
    let paymentMethod: String?
    let reference: String?
    let notes: String?
    let status: PaymentStatus?
    let journalEntryId: String?
    let createdAt: Date?
    let updatedAt: Date?
    let contact: Contact?
}

enum PaymentStatus: String, Codable {
    case pending, processed, reconciled, void

    var displayName: String { rawValue.capitalized }
}

struct PaymentCreate: Encodable {
    var contactId: String?
    var invoiceId: String?
    var billId: String?
    var paymentDate: String
    var amount: Int
    var currencyCode: String?
    var paymentMethod: String?
    var reference: String?
    var notes: String?
}

// MARK: - Quote

struct Quote: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let quoteNumber: String?
    let issueDate: String?
    let expiryDate: String?
    let status: String?
    let reference: String?
    let notes: String?
    let subtotal: Int?
    let taxTotal: Int?
    let total: Int?
    let currencyCode: String?
    let createdAt: Date?
    let contact: Contact?
}

// MARK: - Purchase Order

struct PurchaseOrder: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let poNumber: String?
    let issueDate: String?
    let expiryDate: String?
    let status: String?
    let reference: String?
    let notes: String?
    let subtotal: Int?
    let total: Int?
    let currencyCode: String?
    let createdAt: Date?
    let contact: Contact?
}

// MARK: - Credit / Debit Notes

struct CreditNote: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let creditNoteNumber: String?
    let issueDate: String?
    let status: String?
    let subtotal: Int?
    let taxTotal: Int?
    let total: Int?
    let currencyCode: String?
    let createdAt: Date?
    let contact: Contact?
}

struct DebitNote: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let debitNoteNumber: String?
    let issueDate: String?
    let status: String?
    let subtotal: Int?
    let taxTotal: Int?
    let total: Int?
    let currencyCode: String?
    let createdAt: Date?
    let contact: Contact?
}
