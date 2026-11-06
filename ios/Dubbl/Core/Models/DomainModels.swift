import Foundation

// Shared shapes for the /api/v1 routes the app reads. Amounts are integers in
// the record's currency minor units; quantities are x100; rates are basis
// points. Calendar dates ("2026-01-31") and timestamps (ISO-8601) stay strings
// and go through `DubblDate`. Statuses stay strings so a new server value never
// breaks decoding; the `*Status` helpers map them to labels and tones.

// MARK: - Contacts

struct Contact: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var name: String
    var email: String?
    var phone: String?
    var taxNumber: String?
    var type: String? // customer | supplier | both
    var paymentTermsDays: Int?
    var currencyCode: String?
    var notes: String?
    var creditLimit: Int?
    var addresses: ContactAddresses?
    /// List-only extras: what they owe you, what you owe them, overdue (base currency).
    var owesYou: Int?
    var youOwe: Int?
    var overdue: Int?
    var people: [ContactPerson]?
    var createdAt: String?

    var typeLabel: String {
        switch type {
        case "customer": "Customer"
        case "supplier": "Supplier"
        case "both": "Customer and supplier"
        default: "Contact"
        }
    }
}

struct ContactAddresses: Codable, Sendable, Hashable {
    var billing: Address?
    var shipping: Address?
}

struct Address: Codable, Sendable, Hashable {
    var line1: String?
    var line2: String?
    var city: String?
    var state: String?
    var postalCode: String?
    var country: String?

    var formatted: String {
        let cityLine = [city, state, postalCode].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " ")
        return [line1, line2, cityLine, country].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: "\n")
    }
}

struct ContactPerson: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var name: String
    var email: String?
    var phone: String?
    var jobTitle: String?
    var isPrimary: Bool?
}

struct ContactResponse: Decodable, Sendable { var contact: Contact }

// MARK: - Invoices

struct Invoice: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var contactId: String?
    var invoiceNumber: String
    var issueDate: String
    var dueDate: String
    var status: String
    var invoiceType: String?
    var reference: String?
    var notes: String?
    var subtotal: Int
    var taxTotal: Int
    var total: Int
    var amountPaid: Int
    var amountDue: Int
    var currencyCode: String
    var sentAt: String?
    var paidAt: String?
    var createdAt: String?
    var contact: Contact?
    var lines: [DocumentLine]?
}

struct InvoicePayment: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var paymentNumber: String?
    var date: String
    var amount: Int
    var method: String?
}

struct InvoiceDetailResponse: Decodable, Sendable {
    var invoice: Invoice
    var payments: [InvoicePayment]?
}

struct InvoiceResponse: Decodable, Sendable { var invoice: Invoice }

struct InvoiceSummary: Codable, Sendable, Hashable {
    @LenientInt var totalCount: Int
    @LenientInt var outstanding: Int
    @LenientInt var outstandingCount: Int
    @LenientInt var overdue: Int
    @LenientInt var overdueCount: Int
}

/// A line on an invoice or bill.
struct DocumentLine: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var description: String
    var quantity: Int // x100
    var unitPrice: Int
    var discountPercent: Int? // basis points
    var taxAmount: Int?
    var amount: Int // before tax
    var sortOrder: Int?
    var account: LineAccount?
    var taxRate: LineTaxRate?

    var quantityValue: Double { Double(quantity) / 100 }
}

struct LineAccount: Codable, Sendable, Hashable {
    var id: String
    var code: String?
    var name: String
}

struct LineTaxRate: Codable, Sendable, Hashable {
    var id: String
    var name: String
    var rate: Int // basis points
}

// MARK: - Bills

struct Bill: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var contactId: String?
    var billNumber: String
    var issueDate: String
    var dueDate: String
    var status: String
    var reference: String?
    var notes: String?
    var subtotal: Int
    var taxTotal: Int
    var total: Int
    var amountPaid: Int
    var amountDue: Int
    var currencyCode: String
    var paidAt: String?
    var createdAt: String?
    var contact: Contact?
    var lines: [DocumentLine]?
}

struct BillResponse: Decodable, Sendable { var bill: Bill }

/// `{ counts: { draft: { count, amount }, ... }, total }`. Empty statuses are absent.
struct StatusCounts: Decodable, Sendable {
    struct Entry: Decodable, Sendable, Hashable {
        @LenientInt var count: Int
        @LenientInt var amount: Int
    }

    var counts: [String: Entry]
    @LenientInt var total: Int

    func count(_ status: String) -> Int { counts[status]?.count ?? 0 }
    func amount(_ status: String) -> Int { counts[status]?.amount ?? 0 }
}

// MARK: - Expenses

struct ExpenseClaim: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var status: String
    var totalAmount: Int
    var currencyCode: String
    var submittedAt: String?
    var approvedAt: String?
    var paidAt: String?
    var rejectionReason: String?
    var createdAt: String?
    var submittedByUser: User?
    var approvedByUser: User?
    var items: [ExpenseItem]?
}

struct ExpenseItem: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var date: String
    var description: String
    var amount: Int
    var category: String?
    var receiptFileKey: String?
    var receiptFileName: String?
    var isMileage: Bool?
    var account: LineAccount?
}

struct ExpenseClaimResponse: Decodable, Sendable { var expenseClaim: ExpenseClaim }

// MARK: - Banking

struct BankAccount: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var accountName: String
    var accountNumber: String?
    var bankName: String?
    var currencyCode: String
    var accountType: String?
    var color: String?
    var balance: Int
    var isActive: Bool

    /// "•••• 4821"
    var maskedNumber: String? {
        guard let accountNumber, accountNumber.count >= 4 else { return nil }
        return "•••• " + accountNumber.suffix(4)
    }
}

struct BankAccountsResponse: Decodable, Sendable { var bankAccounts: [BankAccount] }

struct BankTransaction: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var date: String
    var description: String
    var reference: String?
    var amount: Int // signed: negative is money out
    var status: String // unreconciled | reconciled | excluded
    var payee: String?
    var pending: Bool?
    var accountName: String?
}

// MARK: - Notifications

struct AppNotification: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var type: String
    var title: String
    var body: String?
    var entityType: String?
    var entityId: String?
    var readAt: String?
    var createdAt: String

    var isUnread: Bool { readAt == nil }
}

struct NotificationsPage: Decodable, Sendable {
    var data: [AppNotification]
    var pagination: Pagination?
    @LenientInt var unreadCount: Int
}

// MARK: - Status presentation

enum InvoiceStatus {
    static func label(_ status: String) -> String {
        switch status {
        case "pending_approval": "Awaiting approval"
        case "partial": "Part paid"
        default: status.humanized
        }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "paid": .positive
        case "overdue", "rejected": .negative
        case "sent", "partial": .info
        case "pending_approval": .warning
        default: .neutral // draft, void
        }
    }
}

enum BillStatus {
    static func label(_ status: String) -> String {
        switch status {
        case "pending_approval": "Awaiting approval"
        case "received": "Awaiting payment"
        case "partial": "Part paid"
        default: status.humanized
        }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "paid": .positive
        case "overdue": .negative
        case "received", "partial": .info
        case "pending_approval": .warning
        default: .neutral
        }
    }
}

enum ExpenseStatus {
    static func label(_ status: String) -> String { status.humanized }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "paid": .positive
        case "approved": .info
        case "submitted": .warning
        case "rejected": .negative
        default: .neutral
        }
    }
}

enum PaymentMethod: String, CaseIterable, Identifiable, Sendable {
    case bankTransfer = "bank_transfer", card, cash, check, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bankTransfer: "Bank transfer"
        case .card: "Card"
        case .cash: "Cash"
        case .check: "Check"
        case .other: "Other"
        }
    }

    static func label(_ raw: String?) -> String {
        raw.flatMap { PaymentMethod(rawValue: $0)?.label } ?? "Payment"
    }
}
